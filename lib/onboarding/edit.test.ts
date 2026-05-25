import { describe, expect, it } from "vitest";

import type { PreferencesDto } from "@/lib/services/household/dto";

import type { DraftData } from "./draft";
import {
  draftDataToLikedDishes,
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
  it("covers the household-preference + preferred-dishes steps and omits the allergies step", () => {
    expect(EDIT_STEP_IDS).toEqual([
      "household_basics",
      "food_preferences",
      "preferred_dishes",
      "meal_schedule",
      "budget",
      "review",
    ]);
    expect(EDIT_STEP_IDS).not.toContain("allergies_health");
  });
});

describe("preferencesToDraftData", () => {
  it("seeds every editable preference field, with the name for display", () => {
    const draft = preferencesToDraftData("The Suhane Household", PREFS, [
      "Rajma Chawal",
      "Masala Dosa",
    ]);

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
      preferredDishes: {
        mode: "manual",
        dishNames: ["Rajma Chawal", "Masala Dosa"],
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

  it("opens the preferred-dishes step in system mode when no dishes are liked", () => {
    const draft = preferencesToDraftData("Home", PREFS);
    expect(draft.preferredDishes).toEqual({ mode: "system", dishNames: [] });

    const explicitEmpty = preferencesToDraftData("Home", PREFS, []);
    expect(explicitEmpty.preferredDishes).toEqual({
      mode: "system",
      dishNames: [],
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

  it("never carries preferred dishes into the household preferences patch", () => {
    const patch = draftDataToPreferencesPatch({
      preferredDishes: { mode: "manual", dishNames: ["Rajma Chawal"] },
    });
    expect(patch).not.toHaveProperty("likedDishes");
    expect(patch).not.toHaveProperty("preferredDishes");
    expect(patch).toEqual({});
  });
});

describe("draftDataToLikedDishes", () => {
  it("passes manual picks through, trimmed and de-duplicated in order", () => {
    expect(
      draftDataToLikedDishes({
        preferredDishes: {
          mode: "manual",
          dishNames: ["  Rajma Chawal ", "Masala Dosa", "Rajma Chawal", "  "],
        },
      }),
    ).toEqual(["Rajma Chawal", "Masala Dosa"]);
  });

  it("clears favourites when the household delegates to the system", () => {
    expect(
      draftDataToLikedDishes({
        // A user who switches to "let the system decide" drops their old picks.
        preferredDishes: { mode: "system", dishNames: ["Rajma Chawal"] },
      }),
    ).toEqual([]);
  });

  it("returns an empty list when the step was never touched", () => {
    expect(draftDataToLikedDishes({})).toEqual([]);
  });
});
