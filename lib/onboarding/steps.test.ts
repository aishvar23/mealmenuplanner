import { describe, expect, it } from "vitest";

import {
  FIRST_STEP,
  isFirstStep,
  isLastStep,
  isValidStep,
  LAST_STEP,
  nextStep,
  ONBOARDING_STEPS,
  prevStep,
  STEP_IDS,
  stepIndex,
  TOTAL_STEPS,
} from "@/lib/onboarding/steps";

describe("step model", () => {
  it("matches the design/06 § 2 order and count", () => {
    expect(STEP_IDS).toEqual([
      "household_basics",
      "food_preferences",
      "meal_schedule",
      "allergies_health",
      "budget",
      "review",
    ]);
    expect(TOTAL_STEPS).toBe(6);
  });

  it("has metadata for every step, in order", () => {
    expect(ONBOARDING_STEPS.map((s) => s.id)).toEqual([...STEP_IDS]);
  });

  it("marks only the allergies and budget steps optional", () => {
    const optional = ONBOARDING_STEPS.filter((s) => s.optional).map(
      (s) => s.id,
    );
    expect(optional).toEqual(["allergies_health", "budget"]);
  });

  it("anchors FIRST_STEP and LAST_STEP to the ends", () => {
    expect(FIRST_STEP).toBe("household_basics");
    expect(LAST_STEP).toBe("review");
  });
});

describe("stepIndex", () => {
  it("returns the zero-based position", () => {
    expect(stepIndex("household_basics")).toBe(0);
    expect(stepIndex("meal_schedule")).toBe(2);
    expect(stepIndex("review")).toBe(5);
  });
});

describe("isValidStep", () => {
  it("accepts known step ids", () => {
    for (const id of STEP_IDS) {
      expect(isValidStep(id)).toBe(true);
    }
  });

  it("rejects unknown or stale values", () => {
    for (const value of ["", "intro", "household-basics", "Review"]) {
      expect(isValidStep(value)).toBe(false);
    }
  });
});

describe("isFirstStep / isLastStep", () => {
  it("flags the boundaries only", () => {
    expect(isFirstStep("household_basics")).toBe(true);
    expect(isFirstStep("food_preferences")).toBe(false);
    expect(isLastStep("review")).toBe(true);
    expect(isLastStep("budget")).toBe(false);
  });
});

describe("nextStep / prevStep", () => {
  it("advances and retreats through the sequence", () => {
    expect(nextStep("household_basics")).toBe("food_preferences");
    expect(nextStep("budget")).toBe("review");
    expect(prevStep("review")).toBe("budget");
    expect(prevStep("food_preferences")).toBe("household_basics");
  });

  it("clamps at the ends instead of going out of range", () => {
    expect(nextStep("review")).toBe("review");
    expect(prevStep("household_basics")).toBe("household_basics");
  });

  it("round-trips next→prev for every interior step", () => {
    for (const step of STEP_IDS) {
      if (!isLastStep(step)) {
        expect(prevStep(nextStep(step))).toBe(step);
      }
    }
  });
});
