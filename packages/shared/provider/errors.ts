// Provider Workspace — error semantics (contract 03 § 3).
//
// RESOLVED: provider failures DO NOT add new top-level error codes. The repo's
// `ERROR_CODES` is a closed set of exactly 7 values re-exported to mobile via
// `@mmp/shared/types`; adding to it would change a shared union (Risk R-12).
// Instead, each provider semantic rides as a `details.reason` discriminator on
// one of the existing 7 codes — exactly how `ConflictError` already carries
// `stale_version` / `idempotency_key_reused`.
//
// This module is the single source of truth for that mapping (reason → existing
// code + HTTP status). Services build the right `DomainError` with these reasons;
// web + mobile clients branch on `error.details.reason`. Pure — safe on-device.

// Import through the package's own public seam (`@mmp/shared/types` re-exports
// `ERROR_CODES`/`ErrorCode` from the repo's `lib/errors`) rather than re-reaching
// into `lib/` directly — one re-export path, the same symbols mobile consumes.
import { ERROR_CODES, type ErrorCode } from "../types";

/**
 * The closed set of provider `details.reason` discriminators (contract 03 § 3).
 * Keys and values are identical strings so the union is also the wire value.
 */
export const PROVIDER_ERROR_REASONS = {
  // FORBIDDEN (403)
  provider_membership_required: "provider_membership_required",
  provider_approval_required: "provider_approval_required",
  provider_owner_required: "provider_owner_required",
  auto_accept_not_allowed: "auto_accept_not_allowed",
  auto_accept_consent_required: "auto_accept_consent_required",
  // VALIDATION_ERROR (400)
  menu_incomplete: "menu_incomplete",
  cutoff_invalid: "cutoff_invalid",
  invalid_menu_alternative: "invalid_menu_alternative",
  invalid_customization: "invalid_customization",
  customization_limit_exceeded: "customization_limit_exceeded",
  // CONFLICT (409)
  menu_not_published: "menu_not_published",
  menu_already_locked: "menu_already_locked",
  menu_not_draft: "menu_not_draft",
  menu_not_editable: "menu_not_editable",
  menu_day_exists: "menu_day_exists",
  cutoff_passed: "cutoff_passed",
  response_already_locked: "response_already_locked",
  response_cancelled: "response_cancelled",
  menu_not_locked: "menu_not_locked",
  stale_version: "stale_version",
  batch_stale: "batch_stale",
  provider_invite_not_pending: "provider_invite_not_pending",
  provider_already_member: "provider_already_member",
  provider_member_not_pending: "provider_member_not_pending",
  provider_member_not_removable: "provider_member_not_removable",
  suggestion_not_pending: "suggestion_not_pending",
  // NOT_FOUND (404)
  batch_not_available: "batch_not_available",
} as const;

/** One provider `details.reason` value (discriminator on an existing code). */
export type ProviderErrorReason =
  (typeof PROVIDER_ERROR_REASONS)[keyof typeof PROVIDER_ERROR_REASONS];

/** The existing code + HTTP status a provider reason maps onto (contract 03 § 3). */
export interface ProviderErrorMapping {
  code: ErrorCode;
  httpStatus: number;
}

/**
 * reason → { existing code, HTTP status } (contract 03 § 3 table). The values
 * are the SAME 7 `ERROR_CODES`; this map never introduces a new code.
 */
export const PROVIDER_REASON_TO_CODE: Record<
  ProviderErrorReason,
  ProviderErrorMapping
> = {
  provider_membership_required: {
    code: ERROR_CODES.FORBIDDEN,
    httpStatus: 403,
  },
  provider_approval_required: { code: ERROR_CODES.FORBIDDEN, httpStatus: 403 },
  provider_owner_required: { code: ERROR_CODES.FORBIDDEN, httpStatus: 403 },
  auto_accept_not_allowed: { code: ERROR_CODES.FORBIDDEN, httpStatus: 403 },
  auto_accept_consent_required: {
    code: ERROR_CODES.FORBIDDEN,
    httpStatus: 403,
  },
  menu_incomplete: { code: ERROR_CODES.VALIDATION_ERROR, httpStatus: 400 },
  cutoff_invalid: { code: ERROR_CODES.VALIDATION_ERROR, httpStatus: 400 },
  invalid_menu_alternative: {
    code: ERROR_CODES.VALIDATION_ERROR,
    httpStatus: 400,
  },
  invalid_customization: {
    code: ERROR_CODES.VALIDATION_ERROR,
    httpStatus: 400,
  },
  customization_limit_exceeded: {
    code: ERROR_CODES.VALIDATION_ERROR,
    httpStatus: 400,
  },
  menu_not_published: { code: ERROR_CODES.CONFLICT, httpStatus: 409 },
  menu_already_locked: { code: ERROR_CODES.CONFLICT, httpStatus: 409 },
  menu_not_draft: { code: ERROR_CODES.CONFLICT, httpStatus: 409 },
  menu_not_editable: { code: ERROR_CODES.CONFLICT, httpStatus: 409 },
  menu_day_exists: { code: ERROR_CODES.CONFLICT, httpStatus: 409 },
  cutoff_passed: { code: ERROR_CODES.CONFLICT, httpStatus: 409 },
  response_already_locked: { code: ERROR_CODES.CONFLICT, httpStatus: 409 },
  response_cancelled: { code: ERROR_CODES.CONFLICT, httpStatus: 409 },
  menu_not_locked: { code: ERROR_CODES.CONFLICT, httpStatus: 409 },
  stale_version: { code: ERROR_CODES.CONFLICT, httpStatus: 409 },
  batch_stale: { code: ERROR_CODES.CONFLICT, httpStatus: 409 },
  provider_invite_not_pending: { code: ERROR_CODES.CONFLICT, httpStatus: 409 },
  provider_already_member: { code: ERROR_CODES.CONFLICT, httpStatus: 409 },
  provider_member_not_pending: { code: ERROR_CODES.CONFLICT, httpStatus: 409 },
  provider_member_not_removable: {
    code: ERROR_CODES.CONFLICT,
    httpStatus: 409,
  },
  suggestion_not_pending: { code: ERROR_CODES.CONFLICT, httpStatus: 409 },
  batch_not_available: { code: ERROR_CODES.NOT_FOUND, httpStatus: 404 },
};

/** Look up the existing code + HTTP status for a provider reason. */
export function providerErrorMapping(
  reason: ProviderErrorReason,
): ProviderErrorMapping {
  return PROVIDER_REASON_TO_CODE[reason];
}

/**
 * Base `details` shape carried on a provider error envelope — a `reason`
 * discriminator plus reason-specific extras. Two reasons carry extra fields:
 * `stale_version` adds `currentVersion`; `menu_incomplete` adds `issues`.
 */
export interface ProviderErrorDetails {
  reason: ProviderErrorReason;
  [key: string]: unknown;
}
