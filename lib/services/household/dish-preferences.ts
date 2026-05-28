import "server-only";

import { requireAuthUser, requirePermission } from "@/lib/auth";
import type { Database } from "@/lib/db/database.types";
import { createServerSupabaseClient } from "@/lib/db/server";
import { InternalError, NotFoundError } from "@/lib/errors";
import type { SelfBuiltDish } from "@/lib/onboarding";
import type { CombinationPrefsPayload } from "@/lib/services/onboarding/validate-completion";
import { isUuid } from "@/lib/validation";

type MealSlot = Database["public"]["Enums"]["meal_slot"];

/**
 * `household` service — the household-scoped per-dish meal preferences
 * (`household_dish_preferences` + `household_dish_accompaniments`), the editable
 * counterpart to what `complete_onboarding` writes from Step 3's combination /
 * build picks.
 *
 * Onboarding expands a chosen combination into one per-dish row per member dish
 * (the combination identity isn't stored), so post-onboarding editing operates on
 * those resulting dishes (the user's chosen approach): {@link getHouseholdDishPreferences}
 * seeds the edit wizard's "Build your own" picker from the stored rows, and
 * {@link saveHouseholdDishPreferences} rewrites them. The recommendation engine
 * reads exactly these rows (frequency tier + `suitable_meal_slots` hard filter),
 * so an edit takes effect on the next suggestion. RLS (`hdp_write`/`hda_write`)
 * already gates writes on `can_edit_household_preferences` — the service guard is
 * the defense-in-depth front; the per-request RLS client is the backstop.
 */

interface DishPrefRow {
  dish_id: string;
  frequency: Database["public"]["Enums"]["meal_frequency"];
  suitable_meal_slots: string[];
  dishes: { name: string } | null;
}

/**
 * The household's per-dish preferences as `SelfBuiltDish[]` (dish name + frequency
 * + suitable slots + accompaniments) — the shape the edit wizard's build picker
 * and the Preferences summary consume. Empty when nothing is set or the caller
 * isn't an active member (RLS hides the rows). Order is by dish name for a stable
 * summary.
 */
export async function getHouseholdDishPreferences(
  householdId: string,
): Promise<SelfBuiltDish[]> {
  if (!isUuid(householdId)) return [];
  await requireAuthUser();
  const supabase = await createServerSupabaseClient();

  const { data: prefs, error } = await supabase
    .from("household_dish_preferences")
    .select("dish_id, frequency, suitable_meal_slots, dishes(name)")
    .eq("household_id", householdId);
  if (error) {
    throw new InternalError("Failed to load dish preferences.", {
      cause: error,
    });
  }
  const rows = (prefs ?? []) as unknown as DishPrefRow[];
  if (rows.length === 0) return [];

  const goesWithByDish = await loadAccompaniments(supabase, householdId);

  return rows
    .map((row) => ({
      dishName: row.dishes?.name ?? "",
      frequency: row.frequency,
      suitableFor: (row.suitable_meal_slots ?? []) as MealSlot[],
      goesWith: goesWithByDish.get(row.dish_id) ?? [],
    }))
    .filter((dish) => dish.dishName.length > 0)
    .sort((a, b) => a.dishName.localeCompare(b.dishName));
}

/** dishId → accompaniment dish names, resolved for the household's "goes with" rows. */
async function loadAccompaniments(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  householdId: string,
): Promise<Map<string, string[]>> {
  const { data, error } = await supabase
    .from("household_dish_accompaniments")
    .select("dish_id, accompaniment_dish_id")
    .eq("household_id", householdId);
  if (error) {
    throw new InternalError("Failed to load dish accompaniments.", {
      cause: error,
    });
  }
  const pairs = data ?? [];
  if (pairs.length === 0) return new Map();

  const accIds = [...new Set(pairs.map((p) => p.accompaniment_dish_id))];
  const nameById = await dishNamesByIds(supabase, accIds);

  const byDish = new Map<string, string[]>();
  for (const pair of pairs) {
    const name = nameById.get(pair.accompaniment_dish_id);
    if (!name) continue;
    const list = byDish.get(pair.dish_id) ?? [];
    list.push(name);
    byDish.set(pair.dish_id, list);
  }
  return byDish;
}

/**
 * Rewrite the household's per-dish preferences from a (validated) combination /
 * build payload — the same shape `complete_onboarding` consumes. A full replace:
 * the existing rows + accompaniments are cleared, then the selected combinations
 * (expanded to their member dishes) and built dishes are inserted, built dishes
 * winning a per-dish conflict. `null` clears everything ("let the system decide").
 * Gated on `can_edit_household_preferences`. Popularity is **not** re-bumped on an
 * edit (that's a one-time onboarding signal).
 */
export async function saveHouseholdDishPreferences(
  householdId: string,
  combinationPrefs: CombinationPrefsPayload | null,
): Promise<void> {
  if (!isUuid(householdId)) throw new NotFoundError("Household not found.");
  await requirePermission(householdId, "can_edit_household_preferences");
  const supabase = await createServerSupabaseClient();

  // Full replace — clear first so a removed dish actually disappears. The two
  // tables reference `dishes`, not each other, so deletion order is independent.
  for (const table of [
    "household_dish_accompaniments",
    "household_dish_preferences",
  ] as const) {
    const { error } = await supabase
      .from(table)
      .delete()
      .eq("household_id", householdId);
    if (error) {
      throw new InternalError("Failed to clear dish preferences.", {
        cause: error,
      });
    }
  }

  if (!combinationPrefs) return;

  // Per-dish preference, keyed by dish id so a dish in both a combination and a
  // built entry collapses to one row (built wins, inserted last).
  const prefByDishId = new Map<
    string,
    { frequency: DishPrefRow["frequency"]; suitableFor: MealSlot[] }
  >();

  // Combinations → their member dishes.
  const comboIds = combinationPrefs.selectedCombinations.map(
    (c) => c.combinationId,
  );
  if (comboIds.length > 0) {
    const { data, error } = await supabase
      .from("meal_combination_items")
      .select("combination_id, dish_id")
      .in("combination_id", comboIds);
    if (error) {
      throw new InternalError("Failed to load combination dishes.", {
        cause: error,
      });
    }
    const dishesByCombo = new Map<string, string[]>();
    for (const item of data ?? []) {
      const list = dishesByCombo.get(item.combination_id) ?? [];
      list.push(item.dish_id);
      dishesByCombo.set(item.combination_id, list);
    }
    for (const combo of combinationPrefs.selectedCombinations) {
      for (const dishId of dishesByCombo.get(combo.combinationId) ?? []) {
        prefByDishId.set(dishId, {
          frequency: combo.frequency,
          suitableFor: combo.suitableFor,
        });
      }
    }
  }

  // Built dishes (+ their accompaniments) — resolve every name to an active id
  // in one read, then apply.
  const accRows: {
    household_id: string;
    dish_id: string;
    accompaniment_dish_id: string;
  }[] = [];
  if (combinationPrefs.builtDishes.length > 0) {
    const names = [
      ...new Set(
        combinationPrefs.builtDishes.flatMap((b) => [
          b.dishName,
          ...b.goesWith,
        ]),
      ),
    ];
    const idByName = await dishIdsByNames(supabase, names);

    for (const built of combinationPrefs.builtDishes) {
      const dishId = idByName.get(built.dishName);
      if (!dishId) continue;
      prefByDishId.set(dishId, {
        frequency: built.frequency,
        suitableFor: built.suitableFor,
      });
      for (const accName of built.goesWith) {
        const accId = idByName.get(accName);
        if (accId && accId !== dishId) {
          accRows.push({
            household_id: householdId,
            dish_id: dishId,
            accompaniment_dish_id: accId,
          });
        }
      }
    }
  }

  const prefRows = [...prefByDishId.entries()].map(([dishId, pref]) => ({
    household_id: householdId,
    dish_id: dishId,
    frequency: pref.frequency,
    suitable_meal_slots: pref.suitableFor,
  }));

  if (prefRows.length > 0) {
    const { error } = await supabase
      .from("household_dish_preferences")
      .insert(prefRows);
    if (error) {
      throw new InternalError("Failed to save dish preferences.", {
        cause: error,
      });
    }
  }

  if (accRows.length > 0) {
    const { error } = await supabase
      .from("household_dish_accompaniments")
      .insert(dedupeAccompaniments(accRows));
    if (error) {
      throw new InternalError("Failed to save dish accompaniments.", {
        cause: error,
      });
    }
  }
}

/** id → name for the given dish ids (active or not — used to display existing rows). */
async function dishNamesByIds(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  ids: string[],
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (ids.length === 0) return map;
  const { data, error } = await supabase
    .from("dishes")
    .select("id, name")
    .in("id", ids);
  if (error) {
    throw new InternalError("Failed to resolve dish names.", { cause: error });
  }
  for (const dish of data ?? []) map.set(dish.id, dish.name);
  return map;
}

/** name → id for active dishes with the given names (built mains + accompaniments). */
async function dishIdsByNames(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  names: string[],
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (names.length === 0) return map;
  const { data, error } = await supabase
    .from("dishes")
    .select("id, name")
    .eq("status", "active")
    .in("name", names);
  if (error) {
    throw new InternalError("Failed to resolve dishes.", { cause: error });
  }
  for (const dish of data ?? []) map.set(dish.name, dish.id);
  return map;
}

/** Drop duplicate (dish_id, accompaniment_dish_id) pairs before the bulk insert. */
function dedupeAccompaniments<
  T extends { dish_id: string; accompaniment_dish_id: string },
>(rows: T[]): T[] {
  const seen = new Set<string>();
  return rows.filter((row) => {
    const key = `${row.dish_id}|${row.accompaniment_dish_id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
