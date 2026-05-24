import { describe, expect, it } from "vitest";

import {
  containsAllergen,
  unionAllergies,
} from "@/lib/recommendation/allergens";
import {
  makeDish,
  makeIngredient,
  makeMember,
} from "@/lib/recommendation/test-fixtures";

describe("unionAllergies", () => {
  it("unions, normalizes, and dedupes across members", () => {
    const members = [
      makeMember({ allergies: ["Peanuts", "  gluten "] }),
      makeMember({ allergies: ["peanuts", "Dairy"] }),
    ];
    expect(unionAllergies(members).sort()).toEqual([
      "dairy",
      "gluten",
      "peanuts",
    ]);
  });

  it("drops blank entries", () => {
    expect(unionAllergies([makeMember({ allergies: ["", "  "] })])).toEqual([]);
  });
});

describe("containsAllergen", () => {
  const peanutDish = makeDish({
    ingredients: [
      makeIngredient({ ingredientId: "ing-rice", name: "rice" }),
      makeIngredient({
        ingredientId: "ing-peanut",
        name: "peanut oil",
        category: "pantry",
        isRequired: false,
        isOptional: true,
      }),
    ],
  });

  it("excludes when an allergen matches (including optional ingredients)", () => {
    expect(containsAllergen(peanutDish, ["peanut"])).toBe(true);
  });

  it("does not match a substring of an unrelated ingredient", () => {
    const eggplantDish = makeDish({
      ingredients: [
        makeIngredient({ name: "eggplant", category: "vegetables" }),
      ],
    });
    expect(containsAllergen(eggplantDish, ["egg"])).toBe(false);
  });

  it("returns false for an empty allergy set", () => {
    expect(containsAllergen(peanutDish, [])).toBe(false);
  });

  it("matches by allergen type", () => {
    const milkDish = makeDish({
      ingredients: [
        makeIngredient({
          name: "milk",
          category: "dairy",
          allergenType: "dairy",
        }),
      ],
    });
    expect(containsAllergen(milkDish, ["dairy"])).toBe(true);
  });
});
