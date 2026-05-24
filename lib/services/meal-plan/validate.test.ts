import { describe, expect, it } from "vitest";

import { ValidationError } from "@/lib/errors";

import {
  daysBetweenInclusive,
  eachDateInRange,
  MAX_PLAN_RANGE_DAYS,
  validateRejectRequest,
  validateReplaceRequest,
  validateTodayRequest,
  validateWeekRequest,
} from "./validate";

describe("validateTodayRequest", () => {
  it("accepts a valid date + slot", () => {
    expect(
      validateTodayRequest({ date: "2026-05-25", mealSlot: "dinner" }),
    ).toEqual({
      date: "2026-05-25",
      mealSlot: "dinner",
    });
  });

  it("rejects a malformed date", () => {
    expect(() =>
      validateTodayRequest({ date: "2026-13-40", mealSlot: "dinner" }),
    ).toThrow(ValidationError);
  });

  it("rejects an unknown meal slot", () => {
    expect(() =>
      validateTodayRequest({ date: "2026-05-25", mealSlot: "brunch" }),
    ).toThrow(ValidationError);
  });
});

describe("validateWeekRequest", () => {
  it("accepts a valid ordered range", () => {
    expect(
      validateWeekRequest({ startDate: "2026-05-25", endDate: "2026-05-31" }),
    ).toEqual({ startDate: "2026-05-25", endDate: "2026-05-31" });
  });

  it("accepts a single-day range", () => {
    expect(
      validateWeekRequest({ startDate: "2026-05-25", endDate: "2026-05-25" }),
    ).toEqual({ startDate: "2026-05-25", endDate: "2026-05-25" });
  });

  it("rejects endDate before startDate (plan_dates_ordered)", () => {
    expect(() =>
      validateWeekRequest({ startDate: "2026-05-31", endDate: "2026-05-25" }),
    ).toThrow(ValidationError);
  });

  it("rejects a range over the max span", () => {
    const start = "2026-01-01";
    const end = "2026-12-31"; // far more than MAX_PLAN_RANGE_DAYS
    expect(() =>
      validateWeekRequest({ startDate: start, endDate: end }),
    ).toThrow(ValidationError);
  });

  it("rejects a missing/malformed date", () => {
    expect(() =>
      validateWeekRequest({ startDate: "nope", endDate: "2026-05-25" }),
    ).toThrow(ValidationError);
  });
});

describe("validateReplaceRequest", () => {
  const DISH = "11111111-1111-1111-1111-111111111111";

  it("defaults all fields to null on an empty body", () => {
    expect(validateReplaceRequest({})).toEqual({
      replacementDishId: null,
      reason: null,
      feedbackType: null,
    });
  });

  it("accepts a valid dish id, reason, and feedback type", () => {
    expect(
      validateReplaceRequest({
        replacementDishId: DISH,
        reason: "  prefer this  ",
        feedbackType: "too_much_effort",
      }),
    ).toEqual({
      replacementDishId: DISH,
      reason: "prefer this",
      feedbackType: "too_much_effort",
    });
  });

  it("rejects a non-uuid replacement dish id", () => {
    expect(() => validateReplaceRequest({ replacementDishId: "abc" })).toThrow(
      ValidationError,
    );
  });

  it("rejects an unknown feedback type", () => {
    expect(() => validateReplaceRequest({ feedbackType: "nope" })).toThrow(
      ValidationError,
    );
  });

  it("treats a blank reason as null", () => {
    expect(validateReplaceRequest({ reason: "   " }).reason).toBeNull();
  });
});

describe("validateRejectRequest", () => {
  it("requires a feedback type", () => {
    expect(() => validateRejectRequest({})).toThrow(ValidationError);
  });

  it("accepts a valid feedback type + reason", () => {
    expect(
      validateRejectRequest({ feedbackType: "kids_disliked", reason: "spicy" }),
    ).toEqual({ feedbackType: "kids_disliked", reason: "spicy" });
  });

  it("rejects an unknown feedback type", () => {
    expect(() => validateRejectRequest({ feedbackType: "meh" })).toThrow(
      ValidationError,
    );
  });
});

describe("eachDateInRange", () => {
  it("lists every day inclusive", () => {
    expect(eachDateInRange("2026-05-25", "2026-05-27")).toEqual([
      "2026-05-25",
      "2026-05-26",
      "2026-05-27",
    ]);
  });

  it("returns a single day for an equal range", () => {
    expect(eachDateInRange("2026-05-25", "2026-05-25")).toEqual(["2026-05-25"]);
  });

  it("crosses a month boundary", () => {
    expect(eachDateInRange("2026-05-30", "2026-06-01")).toEqual([
      "2026-05-30",
      "2026-05-31",
      "2026-06-01",
    ]);
  });
});

describe("daysBetweenInclusive", () => {
  it("counts a single day as 1", () => {
    expect(daysBetweenInclusive("2026-05-25", "2026-05-25")).toBe(1);
  });

  it("counts a 7-day week as 7", () => {
    expect(daysBetweenInclusive("2026-05-25", "2026-05-31")).toBe(7);
  });

  it("is bounded by MAX_PLAN_RANGE_DAYS for the validator", () => {
    expect(
      daysBetweenInclusive("2026-05-01", "2026-05-31"),
    ).toBeLessThanOrEqual(MAX_PLAN_RANGE_DAYS);
  });
});
