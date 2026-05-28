import { describe, expect, it } from "vitest";

import { ValidationError } from "@/lib/errors";

import { parseEmailPreferencesInput } from "./validate";

describe("parseEmailPreferencesInput", () => {
  it("defaults every settable category to false", () => {
    expect(parseEmailPreferencesInput({ categories: {} })).toEqual({
      today_meal: false,
      weekly_plan: false,
      member_invited: false,
      member_removed: false,
      member_changes: false,
    });
  });

  it("applies the provided booleans over the all-off baseline", () => {
    const out = parseEmailPreferencesInput({
      categories: { today_meal: true, member_invited: true },
    });
    expect(out.today_meal).toBe(true);
    expect(out.member_invited).toBe(true);
    expect(out.weekly_plan).toBe(false);
  });

  it("rejects a missing or non-object categories", () => {
    expect(() => parseEmailPreferencesInput({})).toThrow(ValidationError);
    expect(() => parseEmailPreferencesInput({ categories: "nope" })).toThrow(
      ValidationError,
    );
    expect(() => parseEmailPreferencesInput({ categories: [] })).toThrow(
      ValidationError,
    );
  });

  it("rejects an unknown / non-settable category key", () => {
    expect(() =>
      parseEmailPreferencesInput({ categories: { bogus: true } }),
    ).toThrow(ValidationError);
    // prep_reminders is a real category but not user-settable here.
    expect(() =>
      parseEmailPreferencesInput({ categories: { prep_reminders: true } }),
    ).toThrow(ValidationError);
  });

  it("rejects a non-boolean value", () => {
    expect(() =>
      parseEmailPreferencesInput({ categories: { today_meal: "yes" } }),
    ).toThrow(ValidationError);
  });
});
