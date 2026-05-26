import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/db/database.types";
import { InternalError } from "@/lib/errors";
import type {
  CandidateDish,
  CandidateIngredient,
  HouseholdContext,
  MealFrequency,
  MealHistory,
  MemberContext,
} from "@/lib/recommendation";

import { subtractDays, type MealSlot } from "./validate";

/** A `meal_slot` enum value, as stored in `*.meal_slots` text[] columns. */
type StoredMealSlot = Database["public"]["Enums"]["meal_slot"];

/**
 * Recommendation input loaders (design/05 § 3, P4-1). Each loader reads one input
 * group under the **per-request RLS client** and maps the snake_case rows into the
 * camelCase engine domain types (`lib/recommendation`), so the pure engine never
 * touches the DB. They are loaded once per generate call by {@link loadSlotInputs}.
 *
 * Two access notes:
 *   - Candidate dishes and their sub-rows are global content; RLS exposes only
 *     `active` dishes (and their joined sub-rows) to authenticated users (P0-12),
 *     which is exactly the candidate set the engine wants.
 *   - Member food preferences go through the `list_household_food_preferences`
 *     SECURITY DEFINER RPC (P4-1 migration), NOT a direct table read: `ufp_select`
 *     would otherwise hide co-members' allergies from a plain member, breaking
 *     the allergy-safety guarantee. The RPC re-checks active membership itself.
 */

type ServerClient = SupabaseClient<Database>;

const HOUSEHOLD_PREFERENCES_SELECT =
  "diet_type, preferred_cuisines, weekday_cooking_time_minutes, weekend_cooking_time_minutes, variety_gap_days, kids_count";

const DISH_SELECT =
  "id, name, diet_type, cuisine, meal_slots, meal_role, total_time_minutes, popularity_count, difficulty, kid_friendly, lunchbox_friendly, image_url, image_alt_text, image_status";

/** Household-level inputs (design/05 § 3.1). `null` when the row doesn't exist. */
export async function loadHouseholdContext(
  supabase: ServerClient,
  householdId: string,
): Promise<HouseholdContext | null> {
  const { data, error } = await supabase
    .from("household_preferences")
    .select(HOUSEHOLD_PREFERENCES_SELECT)
    .eq("household_id", householdId)
    .maybeSingle();

  if (error) {
    throw new InternalError("Failed to load household preferences.", {
      cause: error,
    });
  }
  if (!data) return null;

  const { dishFrequencies, dishSuitableSlots } = await loadDishPreferences(
    supabase,
    householdId,
  );

  return {
    dietType: data.diet_type,
    preferredCuisines: data.preferred_cuisines,
    weekdayCookingTimeMinutes: data.weekday_cooking_time_minutes,
    weekendCookingTimeMinutes: data.weekend_cooking_time_minutes,
    varietyGapDays: data.variety_gap_days,
    kidsCount: data.kids_count,
    dishFrequencies,
    dishSuitableSlots,
  };
}

/**
 * The household's per-dish preferences (P10 `build` mode), read in one pass:
 *   - `dishFrequencies` — dishId → frequency tier (P10).
 *   - `dishSuitableSlots` — dishId → the slots the household restricted the dish
 *     to (P10-8); only dishes with a non-empty list are included, so an absent
 *     dish means "no restriction".
 * Member-read RLS (`hdp_select`) scopes this to the caller's households.
 */
async function loadDishPreferences(
  supabase: ServerClient,
  householdId: string,
): Promise<{
  dishFrequencies: Map<string, MealFrequency>;
  dishSuitableSlots: Map<string, StoredMealSlot[]>;
}> {
  const { data, error } = await supabase
    .from("household_dish_preferences")
    .select("dish_id, frequency, suitable_meal_slots")
    .eq("household_id", householdId);

  if (error) {
    throw new InternalError("Failed to load dish preferences.", {
      cause: error,
    });
  }

  const dishFrequencies = new Map<string, MealFrequency>();
  const dishSuitableSlots = new Map<string, StoredMealSlot[]>();
  for (const row of data ?? []) {
    dishFrequencies.set(row.dish_id, row.frequency);
    const slots = (row.suitable_meal_slots ?? []) as StoredMealSlot[];
    if (slots.length > 0) {
      dishSuitableSlots.set(row.dish_id, slots);
    }
  }
  return { dishFrequencies, dishSuitableSlots };
}

/**
 * Dish ids that belong to a *popular* active meal combination (P10) — combos whose
 * `popularity_count` clears the engine's threshold. Used by the engine's
 * `popularDish` bonus so a household's plate-level favourites lift their member
 * dishes. Returns an empty set when the combinations feature is off.
 */
export async function loadPopularCombinationDishIds(
  supabase: ServerClient,
  popularityThreshold: number,
): Promise<Set<string>> {
  const { data, error } = await supabase
    .from("meal_combinations")
    .select("meal_combination_items(dish_id)")
    .eq("status", "active")
    .gte("popularity_count", popularityThreshold);

  if (error) {
    throw new InternalError("Failed to load popular combinations.", {
      cause: error,
    });
  }

  const ids = new Set<string>();
  for (const combo of (data ?? []) as {
    meal_combination_items: { dish_id: string }[];
  }[]) {
    for (const item of combo.meal_combination_items) {
      ids.add(item.dish_id);
    }
  }
  return ids;
}

/**
 * Active members' food preferences (design/05 § 3.2), via the safe projection
 * RPC so every active member's restrictions are visible regardless of the
 * caller's permissions (allergy safety). Expired guests are filtered in the RPC.
 */
export async function loadActiveMembers(
  supabase: ServerClient,
  householdId: string,
): Promise<MemberContext[]> {
  const { data, error } = await supabase.rpc(
    "list_household_food_preferences",
    { p_household_id: householdId },
  );

  if (error) {
    throw new InternalError("Failed to load member food preferences.", {
      cause: error,
    });
  }

  return (data ?? []).map((row) => ({
    dietType: row.diet_type,
    allergies: row.allergies,
    dislikedIngredients: row.disliked_ingredients,
    likedDishes: row.liked_dishes,
    dislikedDishes: row.disliked_dishes,
  }));
}

/**
 * Active candidate dishes for the slot, with ingredients, prep tasks, and
 * pairings preloaded in bulk (design/05 § 3.3). RLS scopes this to `active`
 * dishes automatically.
 */
export async function loadCandidateDishes(
  supabase: ServerClient,
  mealSlot: MealSlot,
): Promise<CandidateDish[]> {
  const { data: dishes, error } = await supabase
    .from("dishes")
    .select(DISH_SELECT)
    .eq("status", "active")
    .contains("meal_slots", [mealSlot]);

  if (error) {
    throw new InternalError("Failed to load candidate dishes.", {
      cause: error,
    });
  }
  if (!dishes || dishes.length === 0) return [];

  const dishIds = dishes.map((d) => d.id);
  const [ingredientsByDish, prepByDish, pairingsByDish] = await Promise.all([
    loadDishIngredients(supabase, dishIds),
    loadDishPrepTasks(supabase, dishIds),
    loadDishPairings(supabase, dishIds),
  ]);

  return dishes.map((dish) => ({
    id: dish.id,
    name: dish.name,
    dietType: dish.diet_type,
    cuisine: dish.cuisine,
    mealSlots: dish.meal_slots,
    mealRole: dish.meal_role,
    totalTimeMinutes: dish.total_time_minutes,
    popularityCount: dish.popularity_count,
    difficulty: dish.difficulty,
    kidFriendly: dish.kid_friendly,
    lunchboxFriendly: dish.lunchbox_friendly,
    imageUrl: dish.image_url,
    imageAltText: dish.image_alt_text,
    imageStatus: dish.image_status,
    ingredients: ingredientsByDish.get(dish.id) ?? [],
    prepTasks: prepByDish.get(dish.id) ?? [],
    pairings: pairingsByDish.get(dish.id) ?? [],
  }));
}

/**
 * Recent meal history for the household (design/05 § 3.4, § 6). Pre-aggregates
 * `meal_plan_items` (within the variety window) and `meal_feedback` (all-time,
 * since `do_not_suggest_again` is permanent) into the engine's signal sets.
 */
export async function loadMealHistory(
  supabase: ServerClient,
  householdId: string,
  date: string,
  varietyGapDays: number,
): Promise<MealHistory> {
  const windowStart = subtractDays(date, Math.max(varietyGapDays, 0));

  const { data: items, error: itemsError } = await supabase
    .from("meal_plan_items")
    .select("dish_id, status")
    .eq("household_id", householdId)
    .not("dish_id", "is", null)
    .gte("date", windowStart)
    .lt("date", date);

  if (itemsError) {
    throw new InternalError("Failed to load recent meal history.", {
      cause: itemsError,
    });
  }

  const recentlyCookedDishIds = new Set<string>();
  const recentlyRejectedDishIds = new Set<string>();
  for (const item of items ?? []) {
    if (item.dish_id === null) continue;
    recentlyCookedDishIds.add(item.dish_id);
    if (item.status === "rejected" || item.status === "replaced") {
      recentlyRejectedDishIds.add(item.dish_id);
    }
  }

  const { data: feedback, error: feedbackError } = await supabase
    .from("meal_feedback")
    .select("feedback_type, meal_plan_items(dish_id)")
    .eq("household_id", householdId);

  if (feedbackError) {
    throw new InternalError("Failed to load meal feedback.", {
      cause: feedbackError,
    });
  }

  const doNotSuggestAgainDishIds = new Set<string>();
  for (const row of feedback ?? []) {
    const dishId = row.meal_plan_items?.dish_id;
    if (!dishId) continue;
    if (row.feedback_type === "do_not_suggest_again") {
      doNotSuggestAgainDishIds.add(dishId);
    } else if (
      row.feedback_type === "disliked" ||
      row.feedback_type === "kids_disliked"
    ) {
      // Soft dislikes fold into the recently-rejected signal (design/05 § 5 note).
      recentlyRejectedDishIds.add(dishId);
    }
  }

  return {
    recentlyCookedDishIds,
    recentlyRejectedDishIds,
    doNotSuggestAgainDishIds,
  };
}

// ─────────────────────────── bulk sub-resource loaders ───────────────────────────

async function loadDishIngredients(
  supabase: ServerClient,
  dishIds: string[],
): Promise<Map<string, CandidateIngredient[]>> {
  const { data: links, error } = await supabase
    .from("dish_ingredients")
    .select(
      "dish_id, ingredient_id, quantity_per_serving, is_required, is_optional",
    )
    .in("dish_id", dishIds);

  if (error) {
    throw new InternalError("Failed to load dish ingredients.", {
      cause: error,
    });
  }
  const rows = links ?? [];

  const ingredientIds = [...new Set(rows.map((r) => r.ingredient_id))];
  const attrs = await loadIngredientAttrs(supabase, ingredientIds);

  const byDish = new Map<string, CandidateIngredient[]>();
  for (const row of rows) {
    const attr = attrs.get(row.ingredient_id);
    const ingredient: CandidateIngredient = {
      ingredientId: row.ingredient_id,
      name: attr?.name ?? "",
      category: attr?.category ?? "",
      commonNames: attr?.commonNames ?? [],
      allergenType: attr?.allergenType ?? null,
      imageUrl: attr?.imageUrl ?? null,
      imageAltText: attr?.imageAltText ?? null,
      imageStatus: attr?.imageStatus ?? "placeholder",
      quantityPerServing: row.quantity_per_serving,
      isRequired: row.is_required,
      isOptional: row.is_optional,
    };
    const list = byDish.get(row.dish_id);
    if (list) list.push(ingredient);
    else byDish.set(row.dish_id, [ingredient]);
  }
  return byDish;
}

interface IngredientAttrs {
  name: string;
  category: string;
  commonNames: string[];
  allergenType: string | null;
  imageUrl: string | null;
  imageAltText: string | null;
  imageStatus: Database["public"]["Enums"]["image_status"];
}

async function loadIngredientAttrs(
  supabase: ServerClient,
  ingredientIds: string[],
): Promise<Map<string, IngredientAttrs>> {
  const map = new Map<string, IngredientAttrs>();
  if (ingredientIds.length === 0) return map;

  const { data, error } = await supabase
    .from("ingredients")
    .select(
      "id, name, category, common_names, allergen_type, image_url, image_alt_text, image_status",
    )
    .in("id", ingredientIds);

  if (error) {
    throw new InternalError("Failed to load ingredients.", { cause: error });
  }
  for (const row of data ?? []) {
    map.set(row.id, {
      name: row.name,
      category: row.category,
      commonNames: row.common_names,
      allergenType: row.allergen_type,
      imageUrl: row.image_url,
      imageAltText: row.image_alt_text,
      imageStatus: row.image_status,
    });
  }
  return map;
}

async function loadDishPrepTasks(
  supabase: ServerClient,
  dishIds: string[],
): Promise<Map<string, CandidateDish["prepTasks"]>> {
  const { data, error } = await supabase
    .from("dish_prep_tasks")
    .select("dish_id, task_name, required_before_minutes, description")
    .in("dish_id", dishIds);

  if (error) {
    throw new InternalError("Failed to load prep tasks.", { cause: error });
  }

  const byDish = new Map<string, CandidateDish["prepTasks"]>();
  for (const row of data ?? []) {
    const task = {
      taskName: row.task_name,
      requiredBeforeMinutes: row.required_before_minutes,
      description: row.description,
    };
    const list = byDish.get(row.dish_id);
    if (list) list.push(task);
    else byDish.set(row.dish_id, [task]);
  }
  return byDish;
}

async function loadDishPairings(
  supabase: ServerClient,
  dishIds: string[],
): Promise<Map<string, CandidateDish["pairings"]>> {
  const { data, error } = await supabase
    .from("dish_pairings")
    .select("primary_dish_id, paired_dish_id, pairing_type")
    .in("primary_dish_id", dishIds);

  if (error) {
    throw new InternalError("Failed to load dish pairings.", { cause: error });
  }

  const byDish = new Map<string, CandidateDish["pairings"]>();
  for (const row of data ?? []) {
    const pairing = {
      dishId: row.paired_dish_id,
      pairingType: row.pairing_type,
    };
    const list = byDish.get(row.primary_dish_id);
    if (list) list.push(pairing);
    else byDish.set(row.primary_dish_id, [pairing]);
  }
  return byDish;
}
