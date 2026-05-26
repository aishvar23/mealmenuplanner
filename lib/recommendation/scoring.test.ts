import { describe, expect, it } from "vitest";

import {
  RECOMMENDATION_CONFIG,
  type RecommendationConfig,
} from "@/lib/recommendation/config";
import {
  aggregateMemberPreferences,
  isRecentlyCooked,
  primaryIngredientId,
  resolveCookingTimeLimit,
  scoreDish,
  type ScoringContext,
} from "@/lib/recommendation/scoring";
import {
  emptyHistory,
  makeDish,
  makeHousehold,
  makeIngredient,
  makeMember,
} from "@/lib/recommendation/test-fixtures";
import type {
  CandidateDish,
  FactorLabel,
  MealHistory,
} from "@/lib/recommendation/types";

const EMPTY: ReadonlySet<string> = new Set();

function ctx(overrides: Partial<ScoringContext> = {}): ScoringContext {
  return {
    household: makeHousehold(),
    memberAggregate: aggregateMemberPreferences([]),
    history: emptyHistory(),
    usedThisRun: EMPTY,
    mealSlot: "dinner",
    weekend: false,
    cookingTimeLimit: 45,
    prepOutcome: "none",
    recentPrimaryIngredientIds: EMPTY,
    popularCombinationDishIds: EMPTY,
    config: RECOMMENDATION_CONFIG,
    ...overrides,
  };
}

function weightsByLabel(dish: CandidateDish, context: ScoringContext) {
  return Object.fromEntries(
    scoreDish(dish, context).map((f) => [f.label, f.weight]),
  ) as Partial<Record<FactorLabel, number>>;
}

function total(dish: CandidateDish, context: ScoringContext): number {
  return scoreDish(dish, context).reduce((s, f) => s + f.weight, 0);
}

describe("resolveCookingTimeLimit", () => {
  it("uses weekday limit on a weekday", () => {
    expect(resolveCookingTimeLimit(makeHousehold(), false)).toBe(45);
  });
  it("uses weekend limit on a weekend", () => {
    expect(resolveCookingTimeLimit(makeHousehold(), true)).toBe(90);
  });
  it("falls back to weekday limit when weekend is unset", () => {
    const h = makeHousehold({ weekendCookingTimeMinutes: null });
    expect(resolveCookingTimeLimit(h, true)).toBe(45);
  });
  it("returns null when no limit is configured", () => {
    const h = makeHousehold({
      weekdayCookingTimeMinutes: null,
      weekendCookingTimeMinutes: null,
    });
    expect(resolveCookingTimeLimit(h, false)).toBeNull();
  });
});

describe("isRecentlyCooked", () => {
  it("is true via history or the in-run used set", () => {
    const history: MealHistory = emptyHistory({
      recentlyCookedDishIds: new Set(["d1"]),
    });
    expect(isRecentlyCooked("d1", history, EMPTY)).toBe(true);
    expect(isRecentlyCooked("d2", history, new Set(["d2"]))).toBe(true);
    expect(isRecentlyCooked("d3", history, EMPTY)).toBe(false);
  });
});

describe("primaryIngredientId", () => {
  it("picks the highest-quantity required ingredient", () => {
    const dish = makeDish({
      ingredients: [
        makeIngredient({
          ingredientId: "a",
          quantityPerServing: 1,
          isRequired: true,
        }),
        makeIngredient({
          ingredientId: "b",
          quantityPerServing: 5,
          isRequired: true,
        }),
        makeIngredient({
          ingredientId: "c",
          quantityPerServing: 9,
          isRequired: false,
        }),
      ],
    });
    expect(primaryIngredientId(dish)).toBe("b");
  });
  it("returns null when no required ingredient exists", () => {
    const dish = makeDish({
      ingredients: [makeIngredient({ isRequired: false, isOptional: true })],
    });
    expect(primaryIngredientId(dish)).toBeNull();
  });
});

describe("scoreDish — exact weights (design/05 §5)", () => {
  it("scores a clean diet/cuisine/time/fresh dinner dish at 250", () => {
    const w = weightsByLabel(makeDish(), ctx());
    expect(w).toEqual({
      dietMatch: 100,
      mealSlotMatch: 50,
      cuisineMatch: 30,
      cookingTimeWithinLimit: 30,
      notRepeatedRecently: 40,
    });
    expect(total(makeDish(), ctx())).toBe(250);
  });

  it("penalizes a dish that exceeds the cooking-time limit (−40, no +30)", () => {
    const slow = makeDish({ totalTimeMinutes: 90 });
    const w = weightsByLabel(slow, ctx({ cookingTimeLimit: 45 }));
    expect(w.exceedsCookingTime).toBe(-40);
    expect(w.cookingTimeWithinLimit).toBeUndefined();
  });

  it("skips the cooking-time factor when no limit or no total time", () => {
    expect(
      weightsByLabel(makeDish(), ctx({ cookingTimeLimit: null })),
    ).not.toHaveProperty("cookingTimeWithinLimit");
    expect(
      weightsByLabel(makeDish({ totalTimeMinutes: null }), ctx()),
    ).not.toHaveProperty("cookingTimeWithinLimit");
  });

  it("applies the −100 variety swing for a recently-cooked dish", () => {
    const history = emptyHistory({
      recentlyCookedDishIds: new Set(["dish-1"]),
    });
    const w = weightsByLabel(makeDish({ id: "dish-1" }), ctx({ history }));
    expect(w.recentlyCookedWithinGap).toBe(-60);
    expect(w.notRepeatedRecently).toBeUndefined();
  });

  it("adds +20 only when the dish is kid-friendly and the household has kids", () => {
    const kidDish = makeDish({ kidFriendly: true });
    expect(
      weightsByLabel(
        kidDish,
        ctx({ household: makeHousehold({ kidsCount: 2 }) }),
      ).kidFriendlyWhenKids,
    ).toBe(20);
    expect(
      weightsByLabel(
        kidDish,
        ctx({ household: makeHousehold({ kidsCount: 0 }) }),
      ).kidFriendlyWhenKids,
    ).toBeUndefined();
  });

  it("adds +15 for a lunchbox-friendly dish at lunch only", () => {
    const boxDish = makeDish({ lunchboxFriendly: true });
    expect(
      weightsByLabel(boxDish, ctx({ mealSlot: "lunch" }))
        .lunchboxFriendlyForLunch,
    ).toBe(15);
    expect(
      weightsByLabel(boxDish, ctx({ mealSlot: "dinner" }))
        .lunchboxFriendlyForLunch,
    ).toBeUndefined();
  });

  it("adds +10 for a liked dish, suppressed by a disliked ingredient", () => {
    const liked = aggregateMemberPreferences([
      makeMember({ likedDishes: ["Dal Tadka"] }),
    ]);
    expect(
      weightsByLabel(makeDish(), ctx({ memberAggregate: liked }))
        .preferredIngredient,
    ).toBe(10);

    const likedButDisliked = aggregateMemberPreferences([
      makeMember({ likedDishes: ["Dal Tadka"], dislikedIngredients: ["rice"] }),
    ]);
    expect(
      weightsByLabel(makeDish(), ctx({ memberAggregate: likedButDisliked }))
        .preferredIngredient,
    ).toBeUndefined();
  });

  it("applies −80 for a recently-rejected dish or a disliked-dish name", () => {
    const rejected = emptyHistory({
      recentlyRejectedDishIds: new Set(["dish-1"]),
    });
    expect(
      weightsByLabel(makeDish({ id: "dish-1" }), ctx({ history: rejected }))
        .recentlyRejected,
    ).toBe(-80);

    const dislikedAgg = aggregateMemberPreferences([
      makeMember({ dislikedDishes: ["Dal Tadka"] }),
    ]);
    expect(
      weightsByLabel(makeDish(), ctx({ memberAggregate: dislikedAgg }))
        .recentlyRejected,
    ).toBe(-80);
  });

  it("applies −60 for deferrable missing prep", () => {
    expect(
      weightsByLabel(makeDish(), ctx({ prepOutcome: "deferrable" }))
        .missingRequiredPrep,
    ).toBe(-60);
    expect(
      weightsByLabel(makeDish(), ctx({ prepOutcome: "none" }))
        .missingRequiredPrep,
    ).toBeUndefined();
  });

  it("applies −30 for a hard dish on a weekday but not on a weekend", () => {
    const hard = makeDish({ difficulty: "hard" });
    expect(
      weightsByLabel(hard, ctx({ weekend: false })).highDifficultyOnWeekday,
    ).toBe(-30);
    expect(
      weightsByLabel(hard, ctx({ weekend: true })).highDifficultyOnWeekday,
    ).toBeUndefined();
  });
});

describe("scoreDish — ingredient repetition (V2)", () => {
  const enabledConfig: RecommendationConfig = {
    ...RECOMMENDATION_CONFIG,
    ingredientRepetition: { enabled: true, penalty: -25, windowDays: 2 },
  };

  it("does not fire when disabled (MVP default)", () => {
    const w = weightsByLabel(
      makeDish({ ingredients: [makeIngredient({ ingredientId: "ing-rice" })] }),
      ctx({ recentPrimaryIngredientIds: new Set(["ing-rice"]) }),
    );
    expect(w.ingredientRepetition).toBeUndefined();
  });

  it("fires the configured penalty when enabled and the primary repeats", () => {
    const w = weightsByLabel(
      makeDish({ ingredients: [makeIngredient({ ingredientId: "ing-rice" })] }),
      ctx({
        config: enabledConfig,
        recentPrimaryIngredientIds: new Set(["ing-rice"]),
      }),
    );
    expect(w.ingredientRepetition).toBe(-25);
  });
});

describe("aggregateMemberPreferences", () => {
  it("normalizes and unions liked/disliked dishes and disliked ingredients", () => {
    const agg = aggregateMemberPreferences([
      makeMember({ likedDishes: ["Biryani"], dislikedDishes: ["Karela"] }),
      makeMember({ dislikedIngredients: ["  Brinjal "] }),
    ]);
    expect(agg.likedDishNames.has("biryani")).toBe(true);
    expect(agg.dislikedDishNames.has("karela")).toBe(true);
    expect(agg.dislikedIngredients).toContain("brinjal");
  });
});
