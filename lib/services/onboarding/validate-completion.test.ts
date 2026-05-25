import { describe, expect, it } from "vitest";

import { ValidationError, type ValidationIssue } from "@/lib/errors";
import type { DraftData } from "@/lib/onboarding";

import { buildCompletionPayload } from "./validate-completion";

/** A draft with every required field present and valid. */
function completeDraft(): DraftData {
  return {
    householdBasics: { name: "Suhane Household", familySize: 4 },
    foodPreferences: {
      dietType: "vegetarian",
      preferredCuisines: ["North Indian", "South Indian"],
    },
    mealSchedule: {
      mealsToPlan: ["lunch", "dinner"],
      weekdayCookingTimeMinutes: 45,
    },
  };
}

/** Pull the field names out of a thrown ValidationError. */
function issueFields(fn: () => unknown): string[] {
  try {
    fn();
  } catch (error) {
    if (error instanceof ValidationError) {
      return (error.details as ValidationIssue[]).map((i) => i.field);
    }
  }
  return [];
}

describe("buildCompletionPayload", () => {
  it("builds the full payload from a complete draft, applying defaults", () => {
    const payload = buildCompletionPayload(completeDraft());

    expect(payload.household).toEqual({ name: "Suhane Household" });
    expect(payload.preferences).toEqual({
      familySize: 4,
      adultsCount: 0,
      kidsCount: 0,
      dietType: "vegetarian",
      preferredCuisines: ["North Indian", "South Indian"],
      spiceLevel: "medium",
      weekdayCookingTimeMinutes: 45,
      mealsToPlan: ["lunch", "dinner"],
      varietyGapDays: 7,
      allowLeftovers: true,
      budgetPreference: "medium",
    });
    expect(payload.foodPreferences).toBeNull();
  });

  it("trims the household name and carries optional location", () => {
    const draft = completeDraft();
    draft.householdBasics = {
      ...draft.householdBasics,
      name: "  Suhane Household  ",
      locationCountry: " IN ",
      locationCity: "",
    };
    const payload = buildCompletionPayload(draft);
    expect(payload.household.name).toBe("Suhane Household");
    expect(payload.household.locationCountry).toBe("IN");
    expect(payload.household).not.toHaveProperty("locationCity");
  });

  it("keeps provided optional preferences and includes weekend cooking time", () => {
    const draft = completeDraft();
    draft.foodPreferences = { ...draft.foodPreferences, spiceLevel: "spicy" };
    draft.mealSchedule = {
      ...draft.mealSchedule,
      weekendCookingTimeMinutes: 90,
      varietyGapDays: 3,
      allowLeftovers: false,
    };
    draft.budget = { budgetPreference: "low" };

    const payload = buildCompletionPayload(draft);
    expect(payload.preferences.spiceLevel).toBe("spicy");
    expect(payload.preferences.weekendCookingTimeMinutes).toBe(90);
    expect(payload.preferences.varietyGapDays).toBe(3);
    expect(payload.preferences.allowLeftovers).toBe(false);
    expect(payload.preferences.budgetPreference).toBe("low");
  });

  it("builds the owner food-prefs payload only when something is present", () => {
    const draft = completeDraft();
    draft.allergiesHealth = {
      allergies: ["peanuts", "  "],
      healthPreferenceTags: ["high_protein"],
      spicePreference: "mild",
    };
    const payload = buildCompletionPayload(draft);
    expect(payload.foodPreferences).toEqual({
      allergies: ["peanuts"],
      dislikedIngredients: [],
      healthPreferenceTags: ["high_protein"],
      likedDishes: [],
      spicePreference: "mild",
    });
  });

  it("maps manual preferred dishes to liked dishes (BUG-006)", () => {
    const draft = completeDraft();
    draft.preferredDishes = {
      mode: "manual",
      dishNames: ["Masala Dosa", "  ", "Rajma Masala"],
    };
    const payload = buildCompletionPayload(draft);
    expect(payload.foodPreferences?.likedDishes).toEqual([
      "Masala Dosa",
      "Rajma Masala",
    ]);
  });

  it("ignores preferred dishes when the system-choose mode is selected", () => {
    const draft = completeDraft();
    draft.preferredDishes = { mode: "system", dishNames: ["Masala Dosa"] };
    // No other food prefs → no user_food_preferences row at all.
    expect(buildCompletionPayload(draft).foodPreferences).toBeNull();
  });

  it("collects every missing required field into one ValidationError", () => {
    const fields = issueFields(() => buildCompletionPayload({}));
    expect(fields).toEqual(
      expect.arrayContaining([
        "name",
        "familySize",
        "dietType",
        "preferredCuisines",
        "mealsToPlan",
        "weekdayCookingTimeMinutes",
      ]),
    );
  });

  it("rejects an out-of-range family size", () => {
    const draft = completeDraft();
    draft.householdBasics = { ...draft.householdBasics, familySize: 99 };
    expect(issueFields(() => buildCompletionPayload(draft))).toContain(
      "familySize",
    );
  });

  it("rejects an empty cuisines list", () => {
    const draft = completeDraft();
    draft.foodPreferences = { ...draft.foodPreferences, preferredCuisines: [] };
    expect(issueFields(() => buildCompletionPayload(draft))).toContain(
      "preferredCuisines",
    );
  });

  it("rejects an invalid meal slot", () => {
    const draft = completeDraft();
    draft.mealSchedule = {
      ...draft.mealSchedule,
      mealsToPlan: ["brunch"] as never,
    };
    expect(issueFields(() => buildCompletionPayload(draft))).toContain(
      "mealsToPlan",
    );
  });

  it("rejects a non-positive weekday cooking time", () => {
    const draft = completeDraft();
    draft.mealSchedule = {
      ...draft.mealSchedule,
      weekdayCookingTimeMinutes: 0,
    };
    expect(issueFields(() => buildCompletionPayload(draft))).toContain(
      "weekdayCookingTimeMinutes",
    );
  });

  it("rejects an invalid optional enum (diet/spice/budget)", () => {
    const draft = completeDraft();
    draft.budget = { budgetPreference: "lavish" as never };
    expect(issueFields(() => buildCompletionPayload(draft))).toContain(
      "budgetPreference",
    );
  });
});
