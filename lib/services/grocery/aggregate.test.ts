import { describe, expect, it } from "vitest";

import { aggregateGroceryLines, type DishIngredientLine } from "./aggregate";

/** Build a dish→ingredients map from a plain object for terse fixtures. */
function ingredientsMap(
  obj: Record<string, DishIngredientLine[]>,
): Map<string, DishIngredientLine[]> {
  return new Map(Object.entries(obj));
}

const spinach: DishIngredientLine = {
  ingredientId: "ing-spinach",
  name: "Spinach",
  category: "vegetables",
  unit: "g",
  quantityPerServing: 100,
};
const paneer: DishIngredientLine = {
  ingredientId: "ing-paneer",
  name: "Paneer",
  category: "dairy",
  unit: "g",
  quantityPerServing: 50,
};
const salt: DishIngredientLine = {
  ingredientId: "ing-salt",
  name: "Salt",
  category: "spices",
  unit: "tsp",
  quantityPerServing: 1,
};

describe("aggregateGroceryLines", () => {
  it("scales each line by family size", () => {
    const lines = aggregateGroceryLines(
      ["dish-a"],
      ingredientsMap({ "dish-a": [spinach, paneer] }),
      4,
    );
    expect(lines).toHaveLength(2);
    const byId = Object.fromEntries(lines.map((l) => [l.ingredientId, l]));
    expect(byId["ing-spinach"]?.quantity).toBe(400);
    expect(byId["ing-paneer"]?.quantity).toBe(200);
  });

  it("counts a dish once per planned occurrence (repetition sums)", () => {
    // Same dish planned three times → 3 × per-serving × family size.
    const lines = aggregateGroceryLines(
      ["dish-a", "dish-a", "dish-a"],
      ingredientsMap({ "dish-a": [spinach] }),
      2,
    );
    expect(lines).toHaveLength(1);
    expect(lines[0]?.quantity).toBe(600); // 100 * 3 occurrences * 2 servings
  });

  it("merges the same ingredient + same unit across different dishes", () => {
    const lines = aggregateGroceryLines(
      ["dish-a", "dish-b"],
      ingredientsMap({
        "dish-a": [spinach],
        "dish-b": [{ ...spinach, quantityPerServing: 50 }],
      }),
      1,
    );
    expect(lines).toHaveLength(1);
    expect(lines[0]?.quantity).toBe(150);
  });

  it("keeps the same ingredient in different units as separate lines", () => {
    const lines = aggregateGroceryLines(
      ["dish-a", "dish-b"],
      ingredientsMap({
        "dish-a": [{ ...salt, unit: "tsp", quantityPerServing: 1 }],
        "dish-b": [{ ...salt, unit: "g", quantityPerServing: 5 }],
      }),
      1,
    );
    expect(lines).toHaveLength(2);
    expect(lines.map((l) => l.unit).sort()).toEqual(["g", "tsp"]);
  });

  it("merges the same ingredient across compatible units (BUG-011)", () => {
    // Cooking Oil listed as 8 tbsp in one dish and 3 tsp in another: both are
    // volume, so they merge into one line (3 tsp = 1 tbsp → 9 tbsp), shown in the
    // coarsest unit seen.
    const oil: DishIngredientLine = {
      ingredientId: "ing-oil",
      name: "Cooking Oil",
      category: "pantry",
      unit: "tbsp",
      quantityPerServing: 8,
    };
    const lines = aggregateGroceryLines(
      ["dish-a", "dish-b"],
      ingredientsMap({
        "dish-a": [oil],
        "dish-b": [{ ...oil, unit: "tsp", quantityPerServing: 3 }],
      }),
      1,
    );
    expect(lines).toHaveLength(1);
    expect(lines[0]?.unit).toBe("tbsp");
    expect(lines[0]?.quantity).toBe(9);
  });

  it("orders lines by the doc-01 category order, then name", () => {
    const lines = aggregateGroceryLines(
      ["dish-a"],
      ingredientsMap({ "dish-a": [salt, paneer, spinach] }),
      1,
    );
    // vegetables < dairy < spices in CATEGORY_ORDER.
    expect(lines.map((l) => l.category)).toEqual([
      "vegetables",
      "dairy",
      "spices",
    ]);
  });

  it("sorts unknown categories after the known set, then by name", () => {
    const exotic: DishIngredientLine = {
      ingredientId: "ing-truffle",
      name: "Truffle",
      category: "luxury",
      unit: "g",
      quantityPerServing: 1,
    };
    const lines = aggregateGroceryLines(
      ["dish-a"],
      ingredientsMap({ "dish-a": [exotic, spinach] }),
      1,
    );
    expect(lines.map((l) => l.category)).toEqual(["vegetables", "luxury"]);
  });

  it("rounds to numeric(10,3) precision", () => {
    const lines = aggregateGroceryLines(
      ["dish-a"],
      ingredientsMap({
        "dish-a": [{ ...spinach, quantityPerServing: 0.3334 }],
      }),
      1,
    );
    expect(lines[0]?.quantity).toBe(0.333);
  });

  it("returns an empty list when no dishes are planned", () => {
    expect(aggregateGroceryLines([], new Map(), 4)).toEqual([]);
  });

  it("ignores planned dishes with no ingredient rows", () => {
    const lines = aggregateGroceryLines(
      ["dish-a", "dish-missing"],
      ingredientsMap({ "dish-a": [spinach] }),
      1,
    );
    expect(lines).toHaveLength(1);
  });

  it("treats a non-positive family size as one serving", () => {
    const lines = aggregateGroceryLines(
      ["dish-a"],
      ingredientsMap({ "dish-a": [spinach] }),
      0,
    );
    expect(lines[0]?.quantity).toBe(100);
  });
});
