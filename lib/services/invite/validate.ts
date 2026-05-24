/**
 * Request validation for the `invite` service — pure and I/O-free so the rules
 * are unit-testable in isolation and the service just calls it (design/04 § 4.3).
 * Mirrors the `household_invites` schema (doc 01): `invite_has_target` (an email
 * or phone is required), the `member_role` / `membership_type` enums, and the
 * non-null `expires_at`. Enum value sets come from the generated `Constants` so
 * they can't drift.
 *
 * Two expiries are in play (design/07 § 5, § 7): the invite's `expires_at` is the
 * LINK expiry (always set — defaulted for a permanent invite), and for a
 * `temporary_guest` it is ALSO carried onto the member row as the guest-window
 * end. The split between "link expiry" and "guest window end" is collapsed into
 * one value for the MVP — a guest invite link is valid until the window closes.
 */

import {
  defaultPermissionsForRole,
  parsePermissionOverrides,
  type MemberRole,
  type MembershipType,
  type Permission,
} from "@/lib/auth/permissions";
import { Constants } from "@/lib/db/database.types";
import { ValidationError, type ValidationIssue } from "@/lib/errors";
import type { JsonObject } from "@/lib/http";

const MEMBERSHIP_TYPES = Constants.public.Enums.membership_type;

/**
 * Roles an invite may grant. `owner` is excluded — ownership is reached only via
 * transfer (design/07 § 11), never by inviting someone straight to owner.
 */
export const INVITABLE_ROLES = ["admin", "member", "viewer"] as const;

/** Default link lifetime for a permanent invite when no `expiresAt` is given. */
export const DEFAULT_INVITE_TTL_DAYS = 7;

/** Upper bound on how far out an invite/guest window may be set. */
export const MAX_INVITE_TTL_DAYS = 365;

/** A validated, normalized invite ready to persist (snake_case-friendly). */
export interface NormalizedInvite {
  invitedEmail: string | null;
  invitedPhone: string | null;
  membershipType: MembershipType;
  role: MemberRole;
  /** ISO instant; window start (defaults to now). */
  startsAt: string;
  /** ISO instant; link expiry, and the guest-window end for a temporary guest. */
  expiresAt: string;
  /** The full resolved 8-flag set: role defaults overlaid with any overrides. */
  permissions: Record<Permission, boolean>;
}

/** Parse a value as an ISO-8601 instant, returning canonical `…Z`, or null. */
function parseInstant(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) return null;
  return new Date(ms).toISOString();
}

/** A trimmed non-empty string, or null. */
function optionalString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** Minimal email shape check — a single `@` with non-empty local and domain. */
function looksLikeEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

/**
 * Validate + normalize the create-invite body (design/04 § 4.3). Throws a single
 * `ValidationError` collecting every field issue, else returns a
 * {@link NormalizedInvite}. `now` is injectable so the default/expiry math is
 * deterministic in tests.
 */
export function validateCreateInvite(
  body: JsonObject,
  now: Date = new Date(),
): NormalizedInvite {
  const issues: ValidationIssue[] = [];

  // ── target: email and/or phone (invite_has_target) ──
  const invitedEmail = optionalString(body.email);
  const invitedPhone = optionalString(body.phone);
  if (
    body.email != null &&
    invitedEmail !== null &&
    !looksLikeEmail(invitedEmail)
  ) {
    issues.push({ field: "email", rule: "format" });
  }
  if (invitedEmail === null && invitedPhone === null) {
    issues.push({
      field: "email",
      rule: "required",
      message: "An email or phone is required.",
    });
  }

  // ── membershipType ──
  let membershipType: MembershipType = "permanent";
  if (body.membershipType != null) {
    if (
      typeof body.membershipType !== "string" ||
      !(MEMBERSHIP_TYPES as readonly string[]).includes(body.membershipType)
    ) {
      issues.push({
        field: "membershipType",
        rule: "enum",
        allowed: MEMBERSHIP_TYPES,
      });
    } else {
      membershipType = body.membershipType as MembershipType;
    }
  }

  // ── role (owner not invitable) ──
  let role: MemberRole = "member";
  if (body.role != null) {
    if (
      typeof body.role !== "string" ||
      !(INVITABLE_ROLES as readonly string[]).includes(body.role)
    ) {
      issues.push({ field: "role", rule: "enum", allowed: INVITABLE_ROLES });
    } else {
      role = body.role as MemberRole;
    }
  }

  // ── startsAt (optional; defaults to now) ──
  let startsAt = now.toISOString();
  if (body.startsAt != null) {
    const parsed = parseInstant(body.startsAt);
    if (parsed === null) {
      issues.push({ field: "startsAt", rule: "datetime" });
    } else {
      startsAt = parsed;
    }
  }

  // ── expiresAt (required for a guest; defaulted for a permanent invite) ──
  let expiresAt: string | null = null;
  if (body.expiresAt != null) {
    const parsed = parseInstant(body.expiresAt);
    if (parsed === null) {
      issues.push({ field: "expiresAt", rule: "datetime" });
    } else {
      expiresAt = parsed;
    }
  } else if (membershipType === "temporary_guest") {
    // guest_has_expiry: a temporary guest must carry an expiry.
    issues.push({
      field: "expiresAt",
      rule: "required",
      message: "A temporary guest invite requires an expiry.",
    });
  } else {
    expiresAt = new Date(
      now.getTime() + DEFAULT_INVITE_TTL_DAYS * 86_400_000,
    ).toISOString();
  }

  // Window sanity: future expiry, within the cap, and after the start.
  if (expiresAt !== null) {
    const expMs = Date.parse(expiresAt);
    if (expMs <= now.getTime()) {
      issues.push({ field: "expiresAt", rule: "future" });
    } else if (expMs > now.getTime() + MAX_INVITE_TTL_DAYS * 86_400_000) {
      issues.push({
        field: "expiresAt",
        rule: "max",
        maxDays: MAX_INVITE_TTL_DAYS,
      });
    }
    if (Date.parse(startsAt) >= expMs) {
      issues.push({
        field: "startsAt",
        rule: "range",
        message: "startsAt must be before expiresAt.",
      });
    }
  }

  // ── permission overrides (camelCase under `permissions`) ──
  const { overrides, invalidFields } = parsePermissionOverrides(
    body.permissions,
  );
  for (const field of invalidFields) {
    issues.push({ field, rule: "boolean" });
  }

  if (issues.length > 0) {
    throw new ValidationError("Invalid invite.", issues);
  }

  return {
    invitedEmail,
    invitedPhone,
    membershipType,
    role,
    startsAt,
    expiresAt: expiresAt as string,
    permissions: { ...defaultPermissionsForRole(role), ...overrides },
  };
}
