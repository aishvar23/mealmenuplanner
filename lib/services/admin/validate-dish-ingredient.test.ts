import { describe, expect, it } from "vitest";

import { ValidationError } from "@/lib/errors";
import {
  buildDishIngredientInsert,
  buildDishIngredientUpdate,
} from "@/lib/services/admin/validate-dish-ingredient";

const INGREDIENT_ID = "33333333-3333-3333-3333-333333333333";

describe("buildDishIngredientInsert", () => {
  it("translates a valid body", () => {
    const fields = buildDishIngredientInsert({
      ingredientId: INGREDIENT_ID,
      quantityPerServing: 0.5,
      unit: "cup",
      isRequired: true,
      isOptional: false,
    });
    expect(fields).toEqual({
      ingredient_id: INGREDIENT_ID,
      quantity_per_serving: 0.5,
      unit: "cup",
      is_required: true,
      is_optional: false,
    });
  });

  it("requires ingredientId, quantity, and unit", () => {
    expect(() => buildDishIngredientInsert({})).toThrow(ValidationError);
  });

  it("rejects a non-positive quantity", () => {
    expect(() =>
      buildDishIngredientInsert({
        ingredientId: INGREDIENT_ID,
        quantityPerServing: 0,
        unit: "g",
      }),
    ).toThrow(ValidationError);
  });

  it("rejects a non-uuid ingredientId", () => {
    expect(() =>
      buildDishIngredientInsert({
        ingredientId: "nope",
        quantityPerServing: 1,
        unit: "g",
      }),
    ).toThrow(ValidationError);
  });
});

describe("buildDishIngredientUpdate", () => {
  it("allows a partial update", () => {
    expect(buildDishIngredientUpdate({ quantityPerServing: 2 })).toEqual({
      quantity_per_serving: 2,
    });
  });

  it("rejects an empty update", () => {
    expect(() => buildDishIngredientUpdate({})).toThrow(ValidationError);
  });
});
