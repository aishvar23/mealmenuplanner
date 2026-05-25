/**
 * `invite` service DTOs — the snake_case-row → camelCase-payload translation
 * (design/04 § 1). Pure mappers, no I/O, so the route handlers just serialize.
 * Enum **values** pass through unchanged — they are data, not naming convention.
 */

import type { MemberRole, MembershipType } from "@/lib/auth/permissions";
import type { Database } from "@/lib/db/database.types";

/** `POST /api/households/{id}/invites` response (design/04 § 4.3). */
export interface CreateInviteResult {
  inviteId: string;
  /** The shareable link carrying the plaintext token — returned ONCE. */
  inviteLink: string;
}

/** One row of the `get_invite_preview` RPC (the safe, anon-readable projection). */
export type InvitePreviewRow =
  Database["public"]["Functions"]["get_invite_preview"]["Returns"][number];

/** Unauthenticated invite preview (design/04 § 4.3) — non-sensitive fields only. */
export interface InvitePreviewDto {
  householdName: string;
  /** Inviter display name; null if they never set one. */
  invitedBy: string | null;
  membershipType: MembershipType;
  role: MemberRole;
  expiresAt: string;
}

/** Map a `get_invite_preview` row to its camelCase preview DTO. */
export function toInvitePreviewDto(row: InvitePreviewRow): InvitePreviewDto {
  return {
    householdName: row.household_name,
    invitedBy: row.invited_by,
    membershipType: row.membership_type,
    role: row.role,
    expiresAt: row.expires_at,
  };
}

/**
 * A pending invite as the owner-facing household UI lists it (P6, BUG-012).
 * The plaintext token is never read back (only its hash is stored), so a
 * pending row exposes the invitee + role/access + expiry, not a re-shareable
 * link. Active members can read these under the `hi_select` RLS policy.
 */
export interface PendingInviteDto {
  inviteId: string;
  /** One of email/phone is always set (the `invite_has_target` check). */
  invitedEmail: string | null;
  invitedPhone: string | null;
  role: MemberRole;
  membershipType: MembershipType;
  expiresAt: string;
  createdAt: string;
}

/** `POST /api/invites/{token}/accept` response (design/04 § 4.3). */
export interface AcceptInviteResult {
  householdId: string;
  membershipStatus: "active";
}

/** `POST /api/invites/{token}/decline` response (design/04 § 4.3). */
export interface DeclineInviteResult {
  status: "declined";
}
