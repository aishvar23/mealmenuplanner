import { ValidationError, type ValidationIssue } from "@/lib/errors";
import type { JsonObject } from "@/lib/http";
import { EMAIL_RE } from "@/lib/validation/email";
import type { ProviderSpiceLevel } from "@/packages/shared/provider";

/**
 * Pure request validation for the provider membership flows (MP-A-102 +
 * member onboarding, contract 03 § 8). No I/O / `server-only` / Supabase, so the
 * rules unit-test in isolation; the DB CHECK/NOT-NULL constraints + the SECURITY
 * DEFINER RPCs stay the authoritative backstop, this just turns bad input into a
 * clean `ValidationError` (400) instead of a Postgres error mapped to a 500.
 */

/** Default link lifetime for a provider invite when no `expiresAt` is given. */
export const DEFAULT_PROVIDER_INVITE_TTL_DAYS = 7;
/** Upper bound on how far out a provider invite may be set. */
export const MAX_PROVIDER_INVITE_TTL_DAYS = 365;

const PHONE_MAX = 40;
const NAME_MAX = 120;

/** The provider spice levels a member may pick as their default (contract 03 §1). */
export const PROVIDER_SPICE_LEVELS: readonly ProviderSpiceLevel[] = [
  "non_spicy",
  "mild",
  "regular",
  "spicy",
];

/** A trimmed non-empty string, or null. */
function optionalString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** A validated, normalized provider invite ready to persist. */
export interface NormalizedProviderInvite {
  invitedEmail: string | null;
  invitedPhone: string | null;
  /** ISO instant; link expiry. */
  expiresAt: string;
}

/**
 * Validate + normalize the create-invite body. An email or phone is required
 * (the DB `provider_invite_has_target` check); only customers are invitable so
 * there is no role field. `now` is injectable for deterministic expiry math.
 */
export function validateCreateProviderInvite(
  body: JsonObject,
  now: Date = new Date(),
): NormalizedProviderInvite {
  const issues: ValidationIssue[] = [];

  const invitedEmail = optionalString(body.email);
  const invitedPhone = optionalString(body.phone);
  if (
    body.email != null &&
    invitedEmail !== null &&
    !EMAIL_RE.test(invitedEmail)
  ) {
    issues.push({ field: "email", rule: "format" });
  }
  if (invitedPhone !== null && invitedPhone.length > PHONE_MAX) {
    issues.push({ field: "phone", rule: "maxLength", max: PHONE_MAX });
  }
  if (invitedEmail === null && invitedPhone === null) {
    issues.push({
      field: "email",
      rule: "required",
      message: "An email or phone is required.",
    });
  }

  let expiresAt = new Date(
    now.getTime() + DEFAULT_PROVIDER_INVITE_TTL_DAYS * 86_400_000,
  ).toISOString();
  if (body.expiresAt != null) {
    const ms = Date.parse(String(body.expiresAt));
    if (!Number.isFinite(ms)) {
      issues.push({ field: "expiresAt", rule: "datetime" });
    } else if (ms <= now.getTime()) {
      issues.push({ field: "expiresAt", rule: "future" });
    } else if (ms > now.getTime() + MAX_PROVIDER_INVITE_TTL_DAYS * 86_400_000) {
      issues.push({
        field: "expiresAt",
        rule: "max",
        maxDays: MAX_PROVIDER_INVITE_TTL_DAYS,
      });
    } else {
      expiresAt = new Date(ms).toISOString();
    }
  }

  if (issues.length > 0) throw new ValidationError("Invalid invite.", issues);
  return { invitedEmail, invitedPhone, expiresAt };
}

/** A validated, normalized minimal member-onboarding payload. */
export interface NormalizedMemberOnboarding {
  displayName: string;
  phone: string | null;
  defaultSpiceLevel: ProviderSpiceLevel | null;
  allergyAck: boolean;
  termsAck: boolean;
  autoAcceptConsent: boolean;
}

/**
 * Validate + normalize the minimal member-onboarding body (UC-MEMBER-ONBOARD-001).
 * A display name and both acknowledgments are required; spice + consent optional.
 * Crucially it accepts NO household fields — only provider-interaction data.
 */
export function validateMemberOnboarding(
  body: JsonObject,
): NormalizedMemberOnboarding {
  const issues: ValidationIssue[] = [];

  const displayName = optionalString(body.displayName);
  if (displayName === null) {
    issues.push({ field: "displayName", rule: "required" });
  } else if (displayName.length > NAME_MAX) {
    issues.push({ field: "displayName", rule: "maxLength", max: NAME_MAX });
  }

  const phone = optionalString(body.phone);
  if (phone !== null && phone.length > PHONE_MAX) {
    issues.push({ field: "phone", rule: "maxLength", max: PHONE_MAX });
  }

  let defaultSpiceLevel: ProviderSpiceLevel | null = null;
  if (body.defaultSpiceLevel != null) {
    if (
      typeof body.defaultSpiceLevel !== "string" ||
      !PROVIDER_SPICE_LEVELS.includes(
        body.defaultSpiceLevel as ProviderSpiceLevel,
      )
    ) {
      issues.push({
        field: "defaultSpiceLevel",
        rule: "enum",
        allowed: PROVIDER_SPICE_LEVELS,
      });
    } else {
      defaultSpiceLevel = body.defaultSpiceLevel as ProviderSpiceLevel;
    }
  }

  if (body.allergyAck !== true) {
    issues.push({ field: "allergyAck", rule: "required" });
  }
  if (body.termsAck !== true) {
    issues.push({ field: "termsAck", rule: "required" });
  }

  if (issues.length > 0) {
    throw new ValidationError("Some onboarding details are missing.", issues);
  }

  return {
    displayName: displayName as string,
    phone,
    defaultSpiceLevel,
    allergyAck: true,
    termsAck: true,
    autoAcceptConsent: body.autoAcceptConsent === true,
  };
}
