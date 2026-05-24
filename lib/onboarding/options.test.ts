import { describe, expect, it } from "vitest";

import { Constants } from "@/lib/db/database.types";
import {
  BUDGET_OPTIONS,
  CUISINE_OPTIONS,
  DIET_TYPE_OPTIONS,
  HEALTH_TAG_OPTIONS,
  MEAL_SLOT_OPTIONS,
  optionLabel,
  SPICE_LEVEL_OPTIONS,
} from "@/lib/onboarding/options";

describe("enum-derived options", () => {
  it("cover every value of their source enum, in schema order", () => {
    expect(DIET_TYPE_OPTIONS.map((o) => o.value)).toEqual([
      ...Constants.public.Enums.diet_type,
    ]);
    expect(SPICE_LEVEL_OPTIONS.map((o) => o.value)).toEqual([
      ...Constants.public.Enums.spice_level,
    ]);
    expect(BUDGET_OPTIONS.map((o) => o.value)).toEqual([
      ...Constants.public.Enums.budget_preference,
    ]);
    expect(MEAL_SLOT_OPTIONS.map((o) => o.value)).toEqual([
      ...Constants.public.Enums.meal_slot,
    ]);
  });

  it("give every option a non-empty label", () => {
    for (const options of [
      DIET_TYPE_OPTIONS,
      SPICE_LEVEL_OPTIONS,
      BUDGET_OPTIONS,
      MEAL_SLOT_OPTIONS,
      CUISINE_OPTIONS,
      HEALTH_TAG_OPTIONS,
    ]) {
      for (const option of options) {
        expect(option.label.length).toBeGreaterThan(0);
      }
    }
  });
});

describe("optionLabel", () => {
  it("returns the matching label", () => {
    expect(optionLabel(DIET_TYPE_OPTIONS, "non_vegetarian")).toBe(
      "Non-vegetarian",
    );
    expect(optionLabel(HEALTH_TAG_OPTIONS, "high_protein")).toBe(
      "High protein",
    );
  });

  it("falls back to the raw value when there is no match", () => {
    expect(optionLabel(DIET_TYPE_OPTIONS, "unknown")).toBe("unknown");
  });
});
