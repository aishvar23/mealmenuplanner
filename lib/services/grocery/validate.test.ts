import { describe, expect, it } from "vitest";

import { ValidationError } from "@/lib/errors";

import {
  validateCheckedRequest,
  validateMealPlanId,
  validateRegenerateRequest,
} from "./validate";

const UUID = "11111111-1111-1111-1111-111111111111";

describe("validateMealPlanId", () => {
  it("accepts a uuid", () => {
    expect(validateMealPlanId(UUID)).toBe(UUID);
  });

  it("rejects a missing or malformed id", () => {
    expect(() => validateMealPlanId(undefined)).toThrow(ValidationError);
    expect(() => validateMealPlanId("not-a-uuid")).toThrow(ValidationError);
    expect(() => validateMealPlanId(123)).toThrow(ValidationError);
  });
});

describe("validateRegenerateRequest", () => {
  it("extracts a valid mealPlanId", () => {
    expect(validateRegenerateRequest({ mealPlanId: UUID })).toEqual({
      mealPlanId: UUID,
    });
  });

  it("rejects an absent mealPlanId", () => {
    expect(() => validateRegenerateRequest({})).toThrow(ValidationError);
  });
});

describe("validateCheckedRequest", () => {
  it("accepts true and false", () => {
    expect(validateCheckedRequest({ checked: true })).toEqual({
      checked: true,
    });
    expect(validateCheckedRequest({ checked: false })).toEqual({
      checked: false,
    });
  });

  it("rejects a non-boolean or absent checked", () => {
    expect(() => validateCheckedRequest({})).toThrow(ValidationError);
    expect(() => validateCheckedRequest({ checked: "yes" })).toThrow(
      ValidationError,
    );
  });
});
