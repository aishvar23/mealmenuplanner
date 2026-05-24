/**
 * Grocery aggregation — the pure core of the grocery list (design/08 § 9, P7-1).
 *
 * I/O-free and `server-only`-free so it is trivially unit-testable with plain
 * fixtures (mirrors the `lib/recommendation` philosophy). The server service
 * (`./generate.ts`) loads rows, calls this, and hands the lines to the
 * `replace_grocery_list` write RPC; this module owns the algorithm.
 *
 * Algorithm (design/08 § 9):
 *   - Source is one entry per PLANNED MEAL OCCURRENCE (a dish on a date+slot). A
 *     dish planned twice contributes its ingredients twice (`plannedDishIds`
 *     carries repetition).
 *   - `scaledQty = quantity_per_serving * family_size`, summed across occurrences.
 *   - Merge key is `(ingredientId, unit)`: same ingredient + same unit sums into
 *     one line; same ingredient + DIFFERENT unit stays a separate line — the
 *     documented unit-conversion concern (MVP does not auto-convert).
 *   - Lines are ordered by category (the doc-01 display order) then name, so the
 *     read DTO and UI grouping are deterministic.
 */

import { categoryRank } from "@/lib/grocery/labels";

/** A dish↔ingredient link as the aggregator needs it (loader maps rows → this). */
export interface DishIngredientLine {
  ingredientId: string;
  /** Snapshot name from `ingredients` at generation time. */
  name: string;
  /** Snapshot `ingredients.category` (free text in doc 01). */
  category: string;
  /** The `dish_ingredients.unit` (the merge key unit, not `ingredients.default_unit`). */
  unit: string;
  /** `dish_ingredients.quantity_per_serving` (> 0 per doc 01). */
  quantityPerServing: number;
}

/** One merged grocery line — the shape passed to the write RPC and the DTO. */
export interface GroceryLine {
  ingredientId: string;
  name: string;
  category: string;
  unit: string;
  /** Summed `quantity_per_serving` × `family_size`, rounded to numeric(10,3). */
  quantity: number;
}

/**
 * Aggregate the planned dishes' ingredients into merged, category-ordered grocery
 * lines (design/08 § 9). `plannedDishIds` lists one id per qualifying
 * `meal_plan_items` occurrence (repeats allowed → counted per occurrence);
 * `ingredientsByDish` maps each dish to its `dish_ingredients` lines.
 */
export function aggregateGroceryLines(
  plannedDishIds: readonly string[],
  ingredientsByDish: ReadonlyMap<string, readonly DishIngredientLine[]>,
  familySize: number,
): GroceryLine[] {
  // family_size is 1..50 in doc 01; guard against a stray non-positive value.
  const servings = familySize > 0 ? familySize : 1;

  interface Bucket {
    ingredientId: string;
    name: string;
    category: string;
    unit: string;
    perServingTotal: number;
  }
  const buckets = new Map<string, Bucket>();

  for (const dishId of plannedDishIds) {
    const lines = ingredientsByDish.get(dishId);
    if (!lines) continue;
    for (const line of lines) {
      const key = `${line.ingredientId}|${line.unit}`;
      const existing = buckets.get(key);
      if (existing) {
        existing.perServingTotal += line.quantityPerServing;
      } else {
        buckets.set(key, {
          ingredientId: line.ingredientId,
          name: line.name,
          category: line.category,
          unit: line.unit,
          perServingTotal: line.quantityPerServing,
        });
      }
    }
  }

  const lines: GroceryLine[] = [];
  for (const bucket of buckets.values()) {
    lines.push({
      ingredientId: bucket.ingredientId,
      name: bucket.name,
      category: bucket.category,
      unit: bucket.unit,
      quantity: roundQuantity(bucket.perServingTotal * servings),
    });
  }

  lines.sort(
    (a, b) =>
      categoryRank(a.category) - categoryRank(b.category) ||
      a.category.localeCompare(b.category) ||
      a.name.localeCompare(b.name) ||
      a.unit.localeCompare(b.unit),
  );
  return lines;
}

/** Round to numeric(10,3) precision so the response matches what Postgres stores. */
function roundQuantity(value: number): number {
  return Math.round(value * 1000) / 1000;
}
