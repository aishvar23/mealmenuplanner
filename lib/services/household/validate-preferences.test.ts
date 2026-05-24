import { describe, expect, it } from "vitest";

import { ValidationError } from "@/lib/errors";
import { buildPreferencesUpdate } from "@/lib/services/household/validate-preferences";

/** Pull the field names out of a thrown ValidationError's issue list. */
function issueFields(fn: () => unknown): string[] {
  try {
    fn();
  } catch (error) {
    if (error instanceof ValidationError) {
      return (error.details ?? []).map((issue) => issue.field);
    }
    throw error;
  }
  throw new Error("expected buildPreferencesUpdate to throw");
}

describe("buildPreferencesUpdate", () => {
  it("translates a full body to snake_case columns", () => {
    expect(
      buildPreferencesUpdate({
        familySize: 4,
        adultsCount: 2,
        kidsCount: 2,
        dietType: "vegetarian",
        preferredCuisines: ["North Indian", "South Indian"],
        spiceLevel: "medium",
        weekdayCookingTimeMinutes: 30,
        weekendCookingTimeMinutes: 60,
        mealsToPlan: ["breakfast", "lunch", "dinner"],
        varietyGapDays: 7,
        allowLeftovers: true,
        budgetPreference: "medium",
      }),
    ).toEqual({
      family_size: 4,
      adults_count: 2,
      kids_count: 2,
      diet_type: "vegetarian",
      preferred_cuisines: ["North Indian", "South Indian"],
      spice_level: "medium",
      weekday_cooking_time_minutes: 30,
      weekend_cooking_time_minutes: 60,
      meals_to_plan: ["breakfast", "lunch", "dinner"],
      variety_gap_days: 7,
      allow_leftovers: true,
      budget_preference: "medium",
    });
  });

  it("includes only the provided fields (partial update)", () => {
    expect(
      buildPreferencesUpdate({ familySize: 5, dietType: "vegan" }),
    ).toEqual({ family_size: 5, diet_type: "vegan" });
  });

  it("ignores unknown keys", () => {
    expect(
      buildPreferencesUpdate({ familySize: 3, surname: "Suhane" }),
    ).toEqual({ family_size: 3 });
  });

  it("allows null to clear a cooking-time field", () => {
    expect(buildPreferencesUpdate({ weekdayCookingTimeMinutes: null })).toEqual(
      { weekday_cooking_time_minutes: null },
    );
  });

  it("throws when no recognized field is present", () => {
    expect(() => buildPreferencesUpdate({})).toThrow(ValidationError);
    expect(() => buildPreferencesUpdate({ nope: 1 })).toThrow(ValidationError);
  });

  it("rejects familySize outside 1..50", () => {
    expect(
      issueFields(() => buildPreferencesUpdate({ familySize: 0 })),
    ).toEqual(["familySize"]);
    expect(
      issueFields(() => buildPreferencesUpdate({ familySize: 51 })),
    ).toEqual(["familySize"]);
  });

  it("rejects a non-integer familySize", () => {
    expect(
      issueFields(() => buildPreferencesUpdate({ familySize: 4.5 })),
    ).toEqual(["familySize"]);
  });

  it("rejects negative adultsCount / kidsCount", () => {
    expect(
      issueFields(() => buildPreferencesUpdate({ adultsCount: -1 })),
    ).toEqual(["adultsCount"]);
    expect(
      issueFields(() => buildPreferencesUpdate({ kidsCount: -1 })),
    ).toEqual(["kidsCount"]);
  });

  it("rejects an unknown dietType / spiceLevel / budgetPreference enum value", () => {
    expect(
      issueFields(() => buildPreferencesUpdate({ dietType: "carnivore" })),
    ).toEqual(["dietType"]);
    expect(
      issueFields(() => buildPreferencesUpdate({ spiceLevel: "nuclear" })),
    ).toEqual(["spiceLevel"]);
    expect(
      issueFields(() => buildPreferencesUpdate({ budgetPreference: "lavish" })),
    ).toEqual(["budgetPreference"]);
  });

  it("rejects a non-positive cooking time", () => {
    expect(
      issueFields(() =>
        buildPreferencesUpdate({ weekdayCookingTimeMinutes: 0 }),
      ),
    ).toEqual(["weekdayCookingTimeMinutes"]);
    expect(
      issueFields(() =>
        buildPreferencesUpdate({ weekendCookingTimeMinutes: -5 }),
      ),
    ).toEqual(["weekendCookingTimeMinutes"]);
  });

  it("rejects mealsToPlan containing a non-meal-slot value", () => {
    expect(
      issueFields(() =>
        buildPreferencesUpdate({ mealsToPlan: ["breakfast", "brunch"] }),
      ),
    ).toEqual(["mealsToPlan"]);
  });

  it("accepts a valid mealsToPlan subset", () => {
    expect(
      buildPreferencesUpdate({ mealsToPlan: ["dinner", "snack"] }),
    ).toEqual({ meals_to_plan: ["dinner", "snack"] });
  });

  it("rejects varietyGapDays outside 0..60", () => {
    expect(
      issueFields(() => buildPreferencesUpdate({ varietyGapDays: 61 })),
    ).toEqual(["varietyGapDays"]);
  });

  it("rejects a non-boolean allowLeftovers and non-string-array preferredCuisines", () => {
    expect(
      issueFields(() => buildPreferencesUpdate({ allowLeftovers: "yes" })),
    ).toEqual(["allowLeftovers"]);
    expect(
      issueFields(() => buildPreferencesUpdate({ preferredCuisines: [1, 2] })),
    ).toEqual(["preferredCuisines"]);
  });

  it("collects every field issue into one error", () => {
    expect(
      issueFields(() =>
        buildPreferencesUpdate({ familySize: 0, dietType: "carnivore" }),
      ),
    ).toEqual(["familySize", "dietType"]);
  });
});
