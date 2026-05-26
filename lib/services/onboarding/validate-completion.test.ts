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

  it("collects selected combination ids (deduped) in combinations mode (P10)", () => {
    const id1 = "11111111-1111-1111-1111-111111111111";
    const id2 = "22222222-2222-2222-2222-222222222222";
    const draft = completeDraft();
    draft.preferredDishes = {
      mode: "combinations",
      selectedCombinationIds: [id1, id2, id1],
    };
    const payload = buildCompletionPayload(draft);
    expect(payload.combinationPrefs).toEqual({
      selectedCombinationIds: [id1, id2],
      builtDishes: [],
    });
    // Combinations mode contributes nothing to liked dishes.
    expect(payload.foodPreferences).toBeNull();
  });

  it("rejects a non-uuid combination id in combinations mode (P10)", () => {
    const draft = completeDraft();
    draft.preferredDishes = {
      mode: "combinations",
      selectedCombinationIds: ["not-a-uuid"],
    };
    expect(issueFields(() => buildCompletionPayload(draft))).toContain(
      "selectedCombinationIds",
    );
  });

  it("returns no combinationPrefs when combinations mode selects nothing (P10)", () => {
    const draft = completeDraft();
    draft.preferredDishes = {
      mode: "combinations",
      selectedCombinationIds: [],
    };
    expect(buildCompletionPayload(draft).combinationPrefs).toBeNull();
  });

  it("builds self-built dishes + liked dishes in build mode (P10)", () => {
    const draft = completeDraft();
    draft.preferredDishes = {
      mode: "build",
      builtDishes: [
        {
          dishName: "Rajma Masala",
          frequency: "daily",
          suitableFor: ["lunch", "dinner"],
          // The main itself is dropped from its own accompaniments.
          goesWith: ["Jeera Rice", "Roti", "Rajma Masala"],
        },
        // No `suitableFor` → defaults to [] (no restriction).
        { dishName: "Idli", frequency: "once_a_week", goesWith: ["Sambar"] },
      ],
    } as unknown as DraftData["preferredDishes"];
    const payload = buildCompletionPayload(draft);
    expect(payload.combinationPrefs).toEqual({
      selectedCombinationIds: [],
      builtDishes: [
        {
          dishName: "Rajma Masala",
          frequency: "daily",
          suitableFor: ["lunch", "dinner"],
          goesWith: ["Jeera Rice", "Roti"],
        },
        {
          dishName: "Idli",
          frequency: "once_a_week",
          suitableFor: [],
          goesWith: ["Sambar"],
        },
      ],
    });
    // Built mains also fold into liked_dishes so the engine's +10 bonus fires.
    expect(payload.foodPreferences?.likedDishes).toEqual([
      "Rajma Masala",
      "Idli",
    ]);
  });

  it("rejects an invalid frequency tier in build mode (P10)", () => {
    const draft = completeDraft();
    // `weekly` is not a valid meal_frequency — cast past the type to exercise the
    // runtime validation (autosave is lenient; the leaf is checked at completion).
    draft.preferredDishes = {
      mode: "build",
      builtDishes: [{ dishName: "Dal", frequency: "weekly", goesWith: [] }],
    } as unknown as DraftData["preferredDishes"];
    expect(issueFields(() => buildCompletionPayload(draft))).toContain(
      "builtDishes.frequency",
    );
  });

  it("de-dupes valid suitableFor slots and rejects an invalid one (P10-8)", () => {
    const draft = completeDraft();
    draft.preferredDishes = {
      mode: "build",
      builtDishes: [
        {
          dishName: "Poha",
          frequency: "daily",
          // Duplicate `breakfast` collapses; `brunch` is not a valid meal_slot.
          suitableFor: ["breakfast", "breakfast", "brunch"],
          goesWith: [],
        },
      ],
    } as unknown as DraftData["preferredDishes"];
    expect(issueFields(() => buildCompletionPayload(draft))).toContain(
      "builtDishes.suitableFor",
    );
  });

  it("normalizes deduped suitableFor when every slot is valid (P10-8)", () => {
    const draft = completeDraft();
    draft.preferredDishes = {
      mode: "build",
      builtDishes: [
        {
          dishName: "Poha",
          frequency: "daily",
          suitableFor: ["breakfast", "breakfast"],
          goesWith: [],
        },
      ],
    } as unknown as DraftData["preferredDishes"];
    const payload = buildCompletionPayload(draft);
    expect(payload.combinationPrefs?.builtDishes[0]?.suitableFor).toEqual([
      "breakfast",
    ]);
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
