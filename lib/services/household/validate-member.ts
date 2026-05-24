/**
 * Request validation for the member-update endpoint (design/04 § 4.4) — pure and
 * I/O-free. A `PATCH .../members/{memberId}` body may carry a `role` and/or any
 * subset of the eight `can_*` flags (top-level, camelCase). Mirrors the
 * `member_role` enum (from the generated `Constants`) and the permission
 * vocabulary, collecting every issue into one `ValidationError`.
 *
 * Unlike the invite create body, `role: "owner"` IS accepted here — it is the
 * ownership-transfer trigger (design/07 § 11); the service decides transfer vs.
 * a plain role/flag edit.
 */

import {
  parsePermissionOverrides,
  type MemberRole,
  type Permission,
} from "@/lib/auth/permissions";
import { Constants } from "@/lib/db/database.types";
import { ValidationError, type ValidationIssue } from "@/lib/errors";
import type { JsonObject } from "@/lib/http";

const MEMBER_ROLES = Constants.public.Enums.member_role;

/** A validated member-update request. */
export interface MemberUpdate {
  /** New role, or null to leave it unchanged. */
  role: MemberRole | null;
  /** Explicit `can_*` flag overrides (snake_case keys). */
  permissionOverrides: Partial<Record<Permission, boolean>>;
}

/**
 * Validate the member-update body. Throws `ValidationError` for an unknown role,
 * a non-boolean flag, or an empty update (no role and no flags), else returns the
 * normalized {@link MemberUpdate}.
 */
export function validateMemberUpdate(body: JsonObject): MemberUpdate {
  const issues: ValidationIssue[] = [];

  let role: MemberRole | null = null;
  if (body.role != null) {
    if (
      typeof body.role !== "string" ||
      !(MEMBER_ROLES as readonly string[]).includes(body.role)
    ) {
      issues.push({ field: "role", rule: "enum", allowed: MEMBER_ROLES });
    } else {
      role = body.role as MemberRole;
    }
  }

  const { overrides, invalidFields } = parsePermissionOverrides(body);
  for (const field of invalidFields) {
    issues.push({ field, rule: "boolean" });
  }

  if (
    role === null &&
    Object.keys(overrides).length === 0 &&
    issues.length === 0
  ) {
    issues.push({
      field: "body",
      rule: "empty",
      message: "Provide a role or at least one permission to change.",
    });
  }

  if (issues.length > 0) {
    throw new ValidationError("Invalid member update.", issues);
  }

  return { role, permissionOverrides: overrides };
}
