import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/db/database.types";
import { InternalError } from "@/lib/errors";

import type { DishIngredientLine } from "./aggregate";

/**
 * `grocery` service input loaders (design/08 § 9, P7-1). Each reads one input
 * group under the **per-request RLS client** the caller passes in (a member can
 * read meal_plan_items, household_preferences, and the active content tables —
 * P0-12), so the loaders never bypass RLS. The aggregation runs in the pure
 * `aggregate.ts`; the write runs through the `replace_grocery_list` RPC.
 *
 * Note: dish_ingredients/ingredients reads are RLS-scoped to ACTIVE dishes
 * (di_select). A dish archived after it was planned would therefore drop its
 * ingredients on regeneration — acceptable for MVP since the recommender only
 * ever plans active dishes; a full fix would read past RLS in the RPC.
 */

type ServerClient = SupabaseClient<Database>;

/** The household's `family_size` (doc 01: 1..50); defaults to 1 if no prefs row. */
export async function loadFamilySize(
  supabase: ServerClient,
  householdId: string,
): Promise<number> {
  const { data, error } = await supabase
    .from("household_preferences")
    .select("family_size")
    .eq("household_id", householdId)
    .maybeSingle();
  if (error) {
    throw new InternalError("Failed to load household size.", { cause: error });
  }
  return data?.family_size ?? 1;
}

/**
 * The dish ids of the plan's grocery-contributing items (design/08 § 9 source
 * set): `dish_id is not null` and `status NOT IN ('eating_out', 'skipped')`.
 * Returns one id per occurrence (a dish planned twice appears twice) so the
 * aggregator can count per occurrence.
 */
export async function loadPlannedDishIds(
  supabase: ServerClient,
  mealPlanId: string,
): Promise<string[]> {
  const { data, error } = await supabase
    .from("meal_plan_items")
    .select("dish_id")
    .eq("meal_plan_id", mealPlanId)
    .not("dish_id", "is", null)
    .not("status", "in", "(eating_out,skipped)");
  if (error) {
    throw new InternalError("Failed to load planned meals.", { cause: error });
  }
  return (data ?? [])
    .map((row) => row.dish_id)
    .filter((id): id is string => id !== null);
}

/**
 * Bulk-load each dish's `dish_ingredients` (quantity_per_serving + unit) joined to
 * the ingredient name/category, keyed by dish id (design/08 § 9). Pass DISTINCT
 * dish ids; the aggregator re-applies occurrence counts.
 */
export async function loadDishIngredientLines(
  supabase: ServerClient,
  dishIds: readonly string[],
): Promise<Map<string, DishIngredientLine[]>> {
  const byDish = new Map<string, DishIngredientLine[]>();
  const distinct = [...new Set(dishIds)];
  if (distinct.length === 0) return byDish;

  const { data: links, error } = await supabase
    .from("dish_ingredients")
    .select("dish_id, ingredient_id, quantity_per_serving, unit")
    .in("dish_id", distinct);
  if (error) {
    throw new InternalError("Failed to load dish ingredients.", {
      cause: error,
    });
  }
  const rows = links ?? [];

  const attrs = await loadIngredientAttrs(
    supabase,
    rows.map((r) => r.ingredient_id),
  );

  for (const row of rows) {
    const attr = attrs.get(row.ingredient_id);
    const line: DishIngredientLine = {
      ingredientId: row.ingredient_id,
      name: attr?.name ?? "",
      category: attr?.category ?? "pantry",
      unit: row.unit,
      quantityPerServing: row.quantity_per_serving,
    };
    const list = byDish.get(row.dish_id);
    if (list) list.push(line);
    else byDish.set(row.dish_id, [line]);
  }
  return byDish;
}

interface IngredientAttrs {
  name: string;
  category: string;
}

async function loadIngredientAttrs(
  supabase: ServerClient,
  ingredientIds: readonly string[],
): Promise<Map<string, IngredientAttrs>> {
  const map = new Map<string, IngredientAttrs>();
  const distinct = [...new Set(ingredientIds)];
  if (distinct.length === 0) return map;

  const { data, error } = await supabase
    .from("ingredients")
    .select("id, name, category")
    .in("id", distinct);
  if (error) {
    throw new InternalError("Failed to load ingredients.", { cause: error });
  }
  for (const row of data ?? []) {
    map.set(row.id, { name: row.name, category: row.category });
  }
  return map;
}
