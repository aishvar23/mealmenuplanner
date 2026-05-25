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
 *   - Merge key is `(ingredientId, dimension)`: the same ingredient measured in
 *     *compatible* units (e.g. tsp + tbsp, or g + kg) is converted to a common
 *     base and summed into ONE line, displayed in the coarsest unit seen (BUG-011,
 *     GROCERY-002). Units in different dimensions (e.g. tsp volume vs g mass) or
 *     non-convertible units (piece, pinch) only merge with an identical unit and
 *     otherwise stay separate — we never guess across incompatible measures.
 *   - Lines are ordered by category (the doc-01 display order) then name, so the
 *     read DTO and UI grouping are deterministic.
 */

import { categoryRank } from "@/lib/grocery/labels";

/**
 * Convertible units → `{ dimension, toBase }`. Volume is normalized to millilitres
 * and mass to grams; values are the standard US/metric kitchen equivalents. Any
 * unit not listed here is non-convertible and merges only with its exact self.
 */
const UNIT_CONVERSIONS: Record<string, { dimension: string; toBase: number }> =
  {
    // ── volume (base: ml) ──
    ml: { dimension: "volume", toBase: 1 },
    milliliter: { dimension: "volume", toBase: 1 },
    millilitre: { dimension: "volume", toBase: 1 },
    l: { dimension: "volume", toBase: 1000 },
    liter: { dimension: "volume", toBase: 1000 },
    litre: { dimension: "volume", toBase: 1000 },
    tsp: { dimension: "volume", toBase: 4.92892 },
    teaspoon: { dimension: "volume", toBase: 4.92892 },
    tbsp: { dimension: "volume", toBase: 14.7868 },
    tablespoon: { dimension: "volume", toBase: 14.7868 },
    cup: { dimension: "volume", toBase: 240 },
    cups: { dimension: "volume", toBase: 240 },
    // ── mass (base: g) ──
    mg: { dimension: "mass", toBase: 0.001 },
    g: { dimension: "mass", toBase: 1 },
    gram: { dimension: "mass", toBase: 1 },
    grams: { dimension: "mass", toBase: 1 },
    kg: { dimension: "mass", toBase: 1000 },
    kilogram: { dimension: "mass", toBase: 1000 },
  };

/**
 * Resolve a `dish_ingredients.unit` to its merge dimension + base-unit factor. A
 * known volume/mass unit shares a dimension with its siblings (so they merge);
 * an unknown unit gets its own dimension keyed by the unit text, so it only ever
 * merges with the identical unit.
 */
function resolveUnit(unit: string): {
  dimension: string;
  toBase: number;
} {
  const key = unit.trim().toLowerCase();
  const known = UNIT_CONVERSIONS[key];
  if (known) return known;
  return { dimension: `unit:${key}`, toBase: 1 };
}

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
    /** Unit the merged line is displayed in — the coarsest unit seen so far. */
    displayUnit: string;
    /** `toBase` factor of `displayUnit`, used to convert the base total back. */
    displayUnitToBase: number;
    /** Sum of `quantityPerServing` expressed in the dimension's base unit. */
    perServingBaseTotal: number;
  }
  const buckets = new Map<string, Bucket>();

  for (const dishId of plannedDishIds) {
    const lines = ingredientsByDish.get(dishId);
    if (!lines) continue;
    for (const line of lines) {
      const { dimension, toBase } = resolveUnit(line.unit);
      const key = `${line.ingredientId}|${dimension}`;
      const perServingBase = line.quantityPerServing * toBase;
      const existing = buckets.get(key);
      if (existing) {
        existing.perServingBaseTotal += perServingBase;
        // Display in the coarsest (largest base-factor) unit so totals stay tidy.
        if (toBase > existing.displayUnitToBase) {
          existing.displayUnit = line.unit;
          existing.displayUnitToBase = toBase;
        }
      } else {
        buckets.set(key, {
          ingredientId: line.ingredientId,
          name: line.name,
          category: line.category,
          displayUnit: line.unit,
          displayUnitToBase: toBase,
          perServingBaseTotal: perServingBase,
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
      unit: bucket.displayUnit,
      quantity: roundQuantity(
        (bucket.perServingBaseTotal * servings) / bucket.displayUnitToBase,
      ),
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
