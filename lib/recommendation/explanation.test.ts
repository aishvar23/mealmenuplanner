import { describe, expect, it } from "vitest";

import {
  buildReason,
  type ReasonContext,
} from "@/lib/recommendation/explanation";
import { makeDish, makeHousehold } from "@/lib/recommendation/test-fixtures";
import type { ScoredFactor } from "@/lib/recommendation/types";

function reasonCtx(overrides: Partial<ReasonContext> = {}): ReasonContext {
  return {
    dish: makeDish(),
    household: makeHousehold(),
    mealSlot: "dinner",
    cookingTimeLimit: 45,
    ...overrides,
  };
}

const F = {
  diet: { label: "dietMatch", weight: 100 } as ScoredFactor,
  slot: { label: "mealSlotMatch", weight: 50 } as ScoredFactor,
  notRepeated: { label: "notRepeatedRecently", weight: 40 } as ScoredFactor,
  cuisine: { label: "cuisineMatch", weight: 30 } as ScoredFactor,
  time: { label: "cookingTimeWithinLimit", weight: 30 } as ScoredFactor,
  // P10 positive factors.
  frequencyDaily: { label: "frequencyDaily", weight: 35 } as ScoredFactor,
  popularDish: { label: "popularDish", weight: 15 } as ScoredFactor,
};

describe("buildReason", () => {
  it("orders fragments by weight (desc) and joins with an Oxford comma", () => {
    const reason = buildReason(
      [F.cuisine, F.diet, F.notRepeated, F.slot, F.time],
      reasonCtx(),
    );
    expect(reason).toBe(
      "Suggested because it is vegetarian, works well for dinner, has not been repeated this week, matches your North Indian cuisine preference, and fits your 45-minute cooking window.",
    );
  });

  it("renders a single positive factor without a comma", () => {
    expect(buildReason([F.diet], reasonCtx())).toBe(
      "Suggested because it is vegetarian.",
    );
  });

  it("joins exactly two factors with 'and'", () => {
    expect(buildReason([F.diet, F.slot], reasonCtx())).toBe(
      "Suggested because it is vegetarian and works well for dinner.",
    );
  });

  it("never narrates negative factors", () => {
    const reason = buildReason(
      [F.diet, { label: "missingRequiredPrep", weight: -60 }],
      reasonCtx(),
    );
    expect(reason).toBe("Suggested because it is vegetarian.");
  });

  it("falls back when there are no positive factors", () => {
    expect(
      buildReason([{ label: "recentlyRejected", weight: -80 }], reasonCtx()),
    ).toBe("Suggested for this meal.");
  });

  it("formats a multi-word diet enum value", () => {
    const reason = buildReason(
      [F.diet],
      reasonCtx({ dish: makeDish({ dietType: "non_vegetarian" }) }),
    );
    expect(reason).toBe("Suggested because it is non-vegetarian.");
  });

  it("narrates the P10 daily-staple and popular-dish factors in weight order", () => {
    const reason = buildReason(
      [F.popularDish, F.diet, F.frequencyDaily],
      reasonCtx(),
    );
    expect(reason).toBe(
      "Suggested because it is vegetarian, is one of your everyday staples, and is a popular choice.",
    );
  });

  it("never narrates the negative once_in_a_while frequency factor", () => {
    const reason = buildReason(
      [F.diet, { label: "frequencyOnceInAWhile", weight: -20 }],
      reasonCtx(),
    );
    expect(reason).toBe("Suggested because it is vegetarian.");
  });

  it("phrases the variety window from variety_gap_days", () => {
    expect(
      buildReason(
        [F.notRepeated],
        reasonCtx({ household: makeHousehold({ varietyGapDays: 7 }) }),
      ),
    ).toContain("this week");
    expect(
      buildReason(
        [F.notRepeated],
        reasonCtx({ household: makeHousehold({ varietyGapDays: 10 }) }),
      ),
    ).toContain("in the last 10 days");
    expect(
      buildReason(
        [F.notRepeated],
        reasonCtx({ household: makeHousehold({ varietyGapDays: 0 }) }),
      ),
    ).toContain("recently");
  });
});
