import { describe, expect, it } from "vitest";

import { ValidationError } from "@/lib/errors";
import {
  buildIngredientInsert,
  buildIngredientUpdate,
} from "@/lib/services/admin/validate-ingredient";

describe("buildIngredientInsert", () => {
  it("translates a valid body and trims text + common names", () => {
    const insert = buildIngredientInsert({
      name: "  Spinach ",
      category: "vegetables",
      defaultUnit: "g",
      commonNames: [" Palak ", ""],
      allergenType: null,
    });
    expect(insert).toEqual({
      name: "Spinach",
      category: "vegetables",
      default_unit: "g",
      common_names: ["Palak"], // trimmed + empties dropped
      allergen_type: null,
    });
  });

  it("requires name, category, and defaultUnit", () => {
    expect(() => buildIngredientInsert({})).toThrow(ValidationError);
    expect(() =>
      buildIngredientInsert({ name: "Spinach", category: "vegetables" }),
    ).toThrow(ValidationError);
  });

  it("rejects a non-string common_names array", () => {
    expect(() =>
      buildIngredientInsert({
        name: "X",
        category: "c",
        defaultUnit: "g",
        commonNames: [1, 2],
      }),
    ).toThrow(ValidationError);
  });
});

describe("buildIngredientUpdate", () => {
  it("allows a partial update", () => {
    expect(buildIngredientUpdate({ category: "spices" })).toEqual({
      category: "spices",
    });
  });

  it("rejects an empty update", () => {
    expect(() => buildIngredientUpdate({})).toThrow(ValidationError);
  });
});
