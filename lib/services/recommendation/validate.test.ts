import { describe, expect, it } from "vitest";

import { ValidationError } from "@/lib/errors";
import {
  isCalendarDate,
  subtractDays,
  validateSlotRequest,
} from "@/lib/services/recommendation/validate";

describe("isCalendarDate", () => {
  it("accepts a real YYYY-MM-DD date", () => {
    expect(isCalendarDate("2026-05-25")).toBe(true);
  });
  it("rejects bad formats and non-strings", () => {
    expect(isCalendarDate("2026-5-25")).toBe(false);
    expect(isCalendarDate("25-05-2026")).toBe(false);
    expect(isCalendarDate(20260525)).toBe(false);
    expect(isCalendarDate(null)).toBe(false);
  });
  it("rejects an out-of-range day that would normalize away", () => {
    expect(isCalendarDate("2026-02-30")).toBe(false);
    expect(isCalendarDate("2026-13-01")).toBe(false);
  });
});

describe("validateSlotRequest", () => {
  it("returns the validated request for good input", () => {
    expect(validateSlotRequest("2026-05-25", "dinner")).toEqual({
      date: "2026-05-25",
      mealSlot: "dinner",
    });
  });

  it("throws ValidationError for a bad date", () => {
    expect(() => validateSlotRequest("nope", "dinner")).toThrow(
      ValidationError,
    );
  });

  it("throws ValidationError for a bad meal slot", () => {
    expect(() => validateSlotRequest("2026-05-25", "brunch")).toThrow(
      ValidationError,
    );
  });

  it("collects both issues at once", () => {
    try {
      validateSlotRequest("nope", "brunch");
      expect.unreachable("should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(ValidationError);
      expect((error as ValidationError).details).toHaveLength(2);
    }
  });
});

describe("subtractDays", () => {
  it("shifts back N calendar days (UTC), crossing month boundaries", () => {
    expect(subtractDays("2026-05-25", 7)).toBe("2026-05-18");
    expect(subtractDays("2026-03-03", 5)).toBe("2026-02-26");
    expect(subtractDays("2026-05-25", 0)).toBe("2026-05-25");
  });
});
