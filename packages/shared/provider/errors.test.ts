import { describe, expect, it } from "vitest";

import { ERROR_CODES } from "../types";

import {
  PROVIDER_ERROR_REASONS,
  PROVIDER_REASON_TO_CODE,
  providerErrorMapping,
  type ProviderErrorReason,
} from "./errors";

/**
 * The provider `details.reason` map is the heart of contract 03 § 3: provider
 * semantics ride on the CLOSED 7-code `ERROR_CODES` via a `details.reason`
 * discriminator and NEVER introduce a new top-level code (Risk R-12). These
 * tests freeze that invariant and the exact reason → code/HTTP table.
 */

const SEVEN_CODES = Object.values(ERROR_CODES);

// The contract 03 § 3 table, transcribed independently of the implementation.
const EXPECTED: Record<
  ProviderErrorReason,
  { code: string; httpStatus: number }
> = {
  provider_membership_required: { code: "FORBIDDEN", httpStatus: 403 },
  provider_approval_required: { code: "FORBIDDEN", httpStatus: 403 },
  provider_owner_required: { code: "FORBIDDEN", httpStatus: 403 },
  auto_accept_not_allowed: { code: "FORBIDDEN", httpStatus: 403 },
  auto_accept_consent_required: { code: "FORBIDDEN", httpStatus: 403 },
  menu_incomplete: { code: "VALIDATION_ERROR", httpStatus: 400 },
  cutoff_invalid: { code: "VALIDATION_ERROR", httpStatus: 400 },
  invalid_menu_alternative: { code: "VALIDATION_ERROR", httpStatus: 400 },
  invalid_customization: { code: "VALIDATION_ERROR", httpStatus: 400 },
  customization_limit_exceeded: { code: "VALIDATION_ERROR", httpStatus: 400 },
  menu_not_published: { code: "CONFLICT", httpStatus: 409 },
  menu_already_locked: { code: "CONFLICT", httpStatus: 409 },
  menu_not_draft: { code: "CONFLICT", httpStatus: 409 },
  cutoff_passed: { code: "CONFLICT", httpStatus: 409 },
  response_already_locked: { code: "CONFLICT", httpStatus: 409 },
  response_cancelled: { code: "CONFLICT", httpStatus: 409 },
  menu_not_locked: { code: "CONFLICT", httpStatus: 409 },
  stale_version: { code: "CONFLICT", httpStatus: 409 },
  batch_stale: { code: "CONFLICT", httpStatus: 409 },
  provider_invite_not_pending: { code: "CONFLICT", httpStatus: 409 },
  provider_already_member: { code: "CONFLICT", httpStatus: 409 },
  provider_member_not_pending: { code: "CONFLICT", httpStatus: 409 },
  provider_member_not_removable: { code: "CONFLICT", httpStatus: 409 },
  suggestion_not_pending: { code: "CONFLICT", httpStatus: 409 },
  batch_not_available: { code: "NOT_FOUND", httpStatus: 404 },
};

describe("provider error-reason map (contract 03 § 3)", () => {
  it("maps every reason to the exact code + HTTP status in the contract table", () => {
    for (const [reason, expected] of Object.entries(EXPECTED)) {
      const mapping = PROVIDER_REASON_TO_CODE[reason as ProviderErrorReason];
      expect(mapping.code).toBe(expected.code);
      expect(mapping.httpStatus).toBe(expected.httpStatus);
    }
  });

  it("introduces NO new top-level code — every mapped code is one of the 7", () => {
    for (const { code } of Object.values(PROVIDER_REASON_TO_CODE)) {
      expect(SEVEN_CODES).toContain(code);
    }
  });

  it("covers exactly the published reason set (no missing or extra reasons)", () => {
    const mapped = Object.keys(PROVIDER_REASON_TO_CODE).sort();
    const declared = Object.values(PROVIDER_ERROR_REASONS).sort();
    const expected = Object.keys(EXPECTED).sort();
    expect(mapped).toEqual(expected);
    expect(declared).toEqual(expected);
  });

  it("uses identical key/value strings so the union doubles as the wire value", () => {
    for (const [key, value] of Object.entries(PROVIDER_ERROR_REASONS)) {
      expect(key).toBe(value);
    }
  });

  it("providerErrorMapping() returns the same mapping as the table", () => {
    expect(providerErrorMapping("cutoff_passed")).toEqual({
      code: ERROR_CODES.CONFLICT,
      httpStatus: 409,
    });
    expect(providerErrorMapping("menu_incomplete")).toEqual({
      code: ERROR_CODES.VALIDATION_ERROR,
      httpStatus: 400,
    });
  });
});
