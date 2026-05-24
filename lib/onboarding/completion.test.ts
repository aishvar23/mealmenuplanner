import { describe, expect, it } from "vitest";

import type { DraftData } from "@/lib/onboarding/draft";
import {
  computeCompletionPercentage,
  isDraftComplete,
  isRequiredFieldSatisfied,
  missingRequiredFields,
  REQUIRED_FIELD_COUNT,
  REQUIRED_FIELD_IDS,
  satisfiedRequiredFields,
} from "@/lib/onboarding/completion";

/** A draft with every minimum-required field present (design/06 § 2). */
function completeDraft(): DraftData {
  return {
    householdBasics: { name: "Suhane Household", familySize: 4 },
    foodPreferences: {
      dietType: "vegetarian",
      preferredCuisines: ["North Indian"],
    },
    mealSchedule: {
      mealsToPlan: ["lunch", "dinner"],
      weekdayCookingTimeMinutes: 45,
    },
  };
}

describe("required-field model", () => {
  it("tracks exactly the six minimum-required fields", () => {
    expect(REQUIRED_FIELD_IDS).toEqual([
      "name",
      "familySize",
      "dietType",
      "preferredCuisines",
      "mealsToPlan",
      "weekdayCookingTimeMinutes",
    ]);
    expect(REQUIRED_FIELD_COUNT).toBe(6);
  });

  it("treats a present, meaningful value as satisfied", () => {
    const draft = completeDraft();
    for (const field of REQUIRED_FIELD_IDS) {
      expect(isRequiredFieldSatisfied(draft, field)).toBe(true);
    }
    expect(missingRequiredFields(draft)).toEqual([]);
    expect(isDraftComplete(draft)).toBe(true);
  });

  it("treats an empty draft as nothing satisfied", () => {
    const draft: DraftData = {};
    expect(satisfiedRequiredFields(draft)).toEqual([]);
    expect(missingRequiredFields(draft)).toEqual([...REQUIRED_FIELD_IDS]);
    expect(isDraftComplete(draft)).toBe(false);
  });

  it("rejects blank, zero, and empty-array values", () => {
    const draft: DraftData = {
      householdBasics: { name: "   ", familySize: 0 },
      foodPreferences: { dietType: "vegetarian", preferredCuisines: [] },
      mealSchedule: { mealsToPlan: [], weekdayCookingTimeMinutes: 0 },
    };
    // Only dietType is meaningfully present.
    expect(satisfiedRequiredFields(draft)).toEqual(["dietType"]);
  });
});

describe("computeCompletionPercentage", () => {
  it("is 0 for an empty draft and 100 for a complete one", () => {
    expect(computeCompletionPercentage({})).toBe(0);
    expect(computeCompletionPercentage(completeDraft())).toBe(100);
  });

  it("rounds the satisfied/6 fraction", () => {
    // 1 of 6 → 17, 3 of 6 → 50, 5 of 6 → 83.
    const oneField: DraftData = {
      householdBasics: { name: "Home" },
    };
    expect(computeCompletionPercentage(oneField)).toBe(17);

    const threeFields: DraftData = {
      householdBasics: { name: "Home", familySize: 2 },
      foodPreferences: { dietType: "vegetarian" },
    };
    expect(computeCompletionPercentage(threeFields)).toBe(50);

    const fiveFields: DraftData = {
      householdBasics: { name: "Home", familySize: 2 },
      foodPreferences: {
        dietType: "vegetarian",
        preferredCuisines: ["North Indian"],
      },
      mealSchedule: { mealsToPlan: ["dinner"] },
    };
    expect(computeCompletionPercentage(fiveFields)).toBe(83);
  });

  it("ignores optional steps — they never move the bar", () => {
    const draft: DraftData = {
      ...completeDraft(),
      allergiesHealth: { allergies: ["peanuts"], spicePreference: "mild" },
      budget: { budgetPreference: "low" },
    };
    expect(computeCompletionPercentage(draft)).toBe(100);
  });
});
