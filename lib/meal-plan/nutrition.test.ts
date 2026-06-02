import { describe, expect, it } from "vitest";

import {
  formatServing,
  giBand,
  hasNutrition,
  sumNutrition,
  type DishNutrition,
} from "@/lib/meal-plan/nutrition";

const dish = (over: Partial<DishNutrition> = {}): DishNutrition => ({
  servingQty: 1,
  servingUnit: "plate",
  calories: 100,
  proteinG: 5,
  carbsG: 10,
  fatG: 2,
  glycemicIndex: 50,
  ...over,
});

describe("giBand", () => {
  it("classifies at the conventional Low/Med/High thresholds", () => {
    expect(giBand(0)).toBe("low");
    expect(giBand(55)).toBe("low");
    expect(giBand(56)).toBe("medium");
    expect(giBand(69)).toBe("medium");
    expect(giBand(70)).toBe("high");
    expect(giBand(110)).toBe("high");
  });

  it("returns null for an unknown GI", () => {
    expect(giBand(null)).toBeNull();
    expect(giBand(undefined)).toBeNull();
  });
});

describe("formatServing", () => {
  it("uses the singular unit for a quantity of one", () => {
    expect(formatServing(1, "plate")).toBe("1 plate");
    expect(formatServing(1, "piece")).toBe("1 pc");
  });

  it("pluralises for non-unit quantities, including fractions", () => {
    expect(formatServing(2, "piece")).toBe("2 pcs");
    expect(formatServing(1.5, "cup")).toBe("1.5 cups");
    expect(formatServing(2, "glass")).toBe("2 glasses");
  });

  it("returns null when quantity or unit is unknown", () => {
    expect(formatServing(null, "plate")).toBeNull();
    expect(formatServing(1, null)).toBeNull();
    expect(formatServing(undefined, undefined)).toBeNull();
  });
});

describe("sumNutrition", () => {
  it("sums macros across profiles", () => {
    expect(sumNutrition([dish(), dish({ calories: 50, proteinG: 1 })])).toEqual(
      {
        calories: 150,
        proteinG: 6,
        carbsG: 20,
        fatG: 4,
      },
    );
  });

  it("skips null entries and treats missing fields as zero", () => {
    expect(
      sumNutrition([
        null,
        dish({ proteinG: null, carbsG: null, fatG: null }),
        undefined,
      ]),
    ).toEqual({ calories: 100, proteinG: 0, carbsG: 0, fatG: 0 });
  });

  it("returns an all-zero total for an empty list", () => {
    expect(sumNutrition([])).toEqual({
      calories: 0,
      proteinG: 0,
      carbsG: 0,
      fatG: 0,
    });
  });
});

describe("hasNutrition", () => {
  it("is true when any macro or calorie value is present", () => {
    expect(hasNutrition(dish())).toBe(true);
    expect(hasNutrition({ calories: 0, proteinG: 3, carbsG: 0, fatG: 0 })).toBe(
      true,
    );
  });

  it("is false for null or an all-zero/all-null profile", () => {
    expect(hasNutrition(null)).toBe(false);
    expect(hasNutrition({ calories: 0, proteinG: 0, carbsG: 0, fatG: 0 })).toBe(
      false,
    );
    expect(
      hasNutrition(
        dish({ calories: null, proteinG: null, carbsG: null, fatG: null }),
      ),
    ).toBe(false);
  });
});
