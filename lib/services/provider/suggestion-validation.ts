import { ValidationError, type ValidationIssue } from "@/lib/errors";
import type { JsonObject } from "@/lib/http";

import { optionalText, requiredText } from "./text-validators";

/**
 * Pure validators for the suggestion write flows (MP-A-131, contract 03 § 8). No
 * I/O / `server-only` / Supabase, so they unit-test in isolation and never reach
 * the DB on a malformed body. The DB still backstops via its `*_text_not_blank`
 * CHECK, but validating here yields a precise field `ValidationError` (400) instead
 * of a generic constraint surfacing as a 500.
 */

/** Max length of a member's free-text suggestion (DB column is unbounded text). */
export const SUGGESTION_TEXT_MAX = 1000;
/** Max length of the owner's optional resolution note. */
export const SUGGESTION_RESPONSE_MAX = 1000;

/** A validated `CreateProviderSuggestionRequest` — the trimmed required text. */
export interface NormalizedSuggestionCreate {
  suggestionText: string;
}

/** A validated `ResolveProviderSuggestionRequest` — the optional trimmed note. */
export interface NormalizedSuggestionResolve {
  /** `undefined` when the key was omitted; `null` clears; otherwise the trimmed note. */
  providerResponse: string | null | undefined;
}

/**
 * Validate a `POST .../suggestions` body. `suggestionText` is required, trimmed,
 * and bounded; anything else is a field `ValidationError`.
 */
export function validateCreateSuggestion(
  body: JsonObject,
): NormalizedSuggestionCreate {
  const issues: ValidationIssue[] = [];
  const suggestionText = requiredText(
    body.suggestionText,
    "suggestionText",
    SUGGESTION_TEXT_MAX,
    issues,
  );
  if (issues.length > 0 || suggestionText === null) {
    throw new ValidationError("Some suggestion details are invalid.", issues);
  }
  return { suggestionText };
}

/**
 * Validate an accept/reject body. The body is optional (an empty POST resolves with
 * no note); when present, `providerResponse` is a nullable, trimmed, bounded note.
 */
export function validateResolveSuggestion(
  body: JsonObject,
): NormalizedSuggestionResolve {
  const issues: ValidationIssue[] = [];
  const providerResponse = optionalText(
    body.providerResponse,
    "providerResponse",
    issues,
    SUGGESTION_RESPONSE_MAX,
  );
  if (issues.length > 0) {
    throw new ValidationError("Some suggestion details are invalid.", issues);
  }
  return { providerResponse };
}
