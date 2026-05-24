import { describe, expect, it } from "vitest";

import { ValidationError } from "@/lib/errors";

import { parseDraftUpdate } from "./validate-draft";

describe("parseDraftUpdate", () => {
  it("accepts a known step and a JSON-object draftData", () => {
    const result = parseDraftUpdate({
      currentStep: "meal_schedule",
      draftData: { mealSchedule: { mealsToPlan: ["dinner"] } },
    });
    expect(result.currentStep).toBe("meal_schedule");
    expect(result.draftData).toEqual({
      mealSchedule: { mealsToPlan: ["dinner"] },
    });
  });

  it("accepts an empty draftData object (a first, data-less save)", () => {
    const result = parseDraftUpdate({
      currentStep: "household_basics",
      draftData: {},
    });
    expect(result.draftData).toEqual({});
  });

  it("ignores the advisory completionPercentage and unknown keys", () => {
    const result = parseDraftUpdate({
      currentStep: "budget",
      completionPercentage: 999,
      draftData: { budget: { budgetPreference: "low" } },
      somethingElse: true,
    });
    expect(result).toEqual({
      currentStep: "budget",
      draftData: { budget: { budgetPreference: "low" } },
    });
  });

  it("rejects an unknown currentStep", () => {
    expect(() =>
      parseDraftUpdate({ currentStep: "not_a_step", draftData: {} }),
    ).toThrow(ValidationError);
  });

  it("rejects a missing currentStep", () => {
    expect(() => parseDraftUpdate({ draftData: {} })).toThrow(ValidationError);
  });

  it("rejects a non-object draftData (array, scalar, null)", () => {
    for (const draftData of [[], "x", 5, null]) {
      expect(() =>
        parseDraftUpdate({ currentStep: "review", draftData }),
      ).toThrow(ValidationError);
    }
  });

  it("rejects a missing draftData", () => {
    expect(() => parseDraftUpdate({ currentStep: "review" })).toThrow(
      ValidationError,
    );
  });

  it("collects both envelope issues in one error", () => {
    try {
      parseDraftUpdate({ currentStep: "bogus", draftData: 7 });
      expect.unreachable("should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(ValidationError);
      const issues = (error as ValidationError).details ?? [];
      expect(issues.map((i) => i.field)).toEqual(["currentStep", "draftData"]);
    }
  });
});
