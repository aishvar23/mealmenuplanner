import { describe, expect, it } from "vitest";

import { ValidationError } from "@/lib/errors";

import {
  SUGGESTION_RESPONSE_MAX,
  SUGGESTION_TEXT_MAX,
  validateCreateSuggestion,
  validateResolveSuggestion,
} from "./suggestion-validation";

describe("validateCreateSuggestion", () => {
  it("trims and returns the suggestion text", () => {
    expect(
      validateCreateSuggestion({ suggestionText: "  add millet  " }),
    ).toEqual({ suggestionText: "add millet" });
  });

  it("rejects a missing or blank suggestion text", () => {
    for (const value of [undefined, null, "", "   ", 42]) {
      expect(() =>
        validateCreateSuggestion({ suggestionText: value as unknown }),
      ).toThrow(ValidationError);
    }
  });

  it("rejects text over the max length", () => {
    expect(() =>
      validateCreateSuggestion({
        suggestionText: "x".repeat(SUGGESTION_TEXT_MAX + 1),
      }),
    ).toThrow(ValidationError);
  });

  it("accepts text exactly at the max length", () => {
    const text = "x".repeat(SUGGESTION_TEXT_MAX);
    expect(validateCreateSuggestion({ suggestionText: text })).toEqual({
      suggestionText: text,
    });
  });
});

describe("validateResolveSuggestion", () => {
  it("omits the note when the key is absent (undefined)", () => {
    expect(validateResolveSuggestion({})).toEqual({
      providerResponse: undefined,
    });
  });

  it("maps an explicit null or blank to null (clear the note)", () => {
    expect(validateResolveSuggestion({ providerResponse: null })).toEqual({
      providerResponse: null,
    });
    expect(validateResolveSuggestion({ providerResponse: "   " })).toEqual({
      providerResponse: null,
    });
  });

  it("trims a present note", () => {
    expect(
      validateResolveSuggestion({ providerResponse: "  added next week  " }),
    ).toEqual({ providerResponse: "added next week" });
  });

  it("rejects a non-string note", () => {
    expect(() =>
      validateResolveSuggestion({ providerResponse: 7 as unknown }),
    ).toThrow(ValidationError);
  });

  it("rejects a note over the max length", () => {
    expect(() =>
      validateResolveSuggestion({
        providerResponse: "x".repeat(SUGGESTION_RESPONSE_MAX + 1),
      }),
    ).toThrow(ValidationError);
  });
});
