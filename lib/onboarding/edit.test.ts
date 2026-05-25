import { describe, expect, it } from "vitest";

import type { PreferencesDto } from "@/lib/services/household/dto";

import type { DraftData } from "./draft";
import {
  draftDataToPreferencesPatch,
  EDIT_STEP_IDS,
  preferencesToDraftData,
} from "./edit";

const PREFS: PreferencesDto = {
  familySize: 4,
  adultsCount: 2,
  kidsCount: 2,
  dietType: "vegetarian",
  preferredCuisines: ["north_indian", "south_indian"],
  spiceLevel: "medium",
  weekdayCookingTimeMinutes: 30,
  weekendCookingTimeMinutes: 60,
  mealsToPlan: ["lunch", "dinner"],
  varietyGapDays: 7,
  allowLeftovers: true,
  budgetPreference: "medium",
};

describe("EDIT_STEP_IDS", () => {
  it("covers the household-preference steps and omits the personal allergies step", () => {
    expect(EDIT_STEP_IDS).toEqual([
      "household_basics",
      "food_preferences",
      "meal_schedule",
      "budget",
      "review",
    ]);
    expect(EDIT_STEP_IDS).not.toContain("allergies_health");
  });
});

describe("preferencesToDraftData", () => {
  it("seeds every editable preference field, with the name for display", () => {
    const draft = preferencesToDraftData("The Suhane Household", PREFS);

    expect(draft).toEqual({
      householdBasics: {
        name: "The Suhane Household",
        familySize: 4,
        adultsCount: 2,
        kidsCount: 2,
      },
      foodPreferences: {
        dietType: "vegetarian",
        preferredCuisines: ["north_indian", "south_indian"],
        spiceLevel: "medium",
      },
      mealSchedule: {
        mealsToPlan: ["lunch", "dinner"],
        weekdayCookingTimeMinutes: 30,
        weekendCookingTimeMinutes: 60,
        varietyGapDays: 7,
        allowLeftovers: true,
      },
      budget: { budgetPreference: "medium" },
    });
  });

  it("does not seed household-row fields the PATCH can't update (location)", () => {
    const draft = preferencesToDraftData("Home", PREFS);
    expect(draft.householdBasics).not.toHaveProperty("locationCountry");
    expect(draft.householdBasics).not.toHaveProperty("locationCity");
  });

  it("maps null cooking times to undefined to match the optional draft shape", () => {
    const draft = preferencesToDraftData("Home", {
      ...PREFS,
      weekdayCookingTimeMinutes: null,
      weekendCookingTimeMinutes: null,
    });
    expect(draft.mealSchedule?.weekdayCookingTimeMinutes).toBeUndefined();
    expect(draft.mealSchedule?.weekendCookingTimeMinutes).toBeUndefined();
  });
});

describe("draftDataToPreferencesPatch", () => {
  it("round-trips a fully-seeded draft back to a preferences PATCH body", () => {
    const patch = draftDataToPreferencesPatch(
      preferencesToDraftData("Home", PREFS),
    );

    expect(patch).toEqual({
      familySize: 4,
      adultsCount: 2,
      kidsCount: 2,
      dietType: "vegetarian",
      preferredCuisines: ["north_indian", "south_indian"],
      spiceLevel: "medium",
      mealsToPlan: ["lunch", "dinner"],
      weekdayCookingTimeMinutes: 30,
      weekendCookingTimeMinutes: 60,
      varietyGapDays: 7,
      allowLeftovers: true,
      budgetPreference: "medium",
    });
  });

  it("omits absent fields so the partial update only touches what changed", () => {
    const patch = draftDataToPreferencesPatch({
      foodPreferences: { dietType: "vegan" },
    });
    expect(patch).toEqual({ dietType: "vegan" });
  });

  it("never carries the household name or personal allergies into the patch", () => {
    const draft: DraftData = {
      householdBasics: { name: "Renamed", familySize: 3 },
      allergiesHealth: { allergies: ["peanuts"] },
    };
    const patch = draftDataToPreferencesPatch(draft);
    expect(patch).not.toHaveProperty("name");
    expect(patch).not.toHaveProperty("allergies");
    expect(patch).toEqual({ familySize: 3 });
  });
});
