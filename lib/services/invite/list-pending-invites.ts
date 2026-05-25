import "server-only";

import { getActiveMembership, hasPermission } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/db/server";
import { InternalError, NotFoundError } from "@/lib/errors";
import { boundedCollection, type Collection } from "@/lib/http";
import { isUuid } from "@/lib/validation";

import type { PendingInviteDto } from "./dto";

/**
 * `invite` service — list a household's pending invites (BUG-012, design/07 § 8).
 *
 * Backs the owner-facing "Pending invites" section of the household screen: after
 * an invite is created (`createInvite`, status `pending`), the inviter should see
 * it sitting in the roster as awaiting acceptance. Without this the page only
 * showed active members, so a freshly-created invite appeared to vanish.
 *
 * Gated by `can_invite_members` (the same flag that creates/manages invites) so
 * only inviters see the invitee list. The `hi_select` RLS policy independently
 * scopes the read to the caller's household, and a non-member is surfaced as
 * `NotFoundError` (existence-hiding, matching `listMembers`).
 *
 * Only `status = 'pending'` rows are returned; accepted/declined/expired invites
 * drop out. The plaintext token is never stored, so a pending row exposes the
 * invitee + role/access + expiry — not a re-shareable link.
 */
export async function listPendingInvites(
  householdId: string,
): Promise<Collection<PendingInviteDto>> {
  if (!isUuid(householdId)) {
    throw new NotFoundError("Household not found.");
  }

  const membership = await getActiveMembership(householdId);
  if (!membership) {
    throw new NotFoundError("Household not found.");
  }
  // Non-inviters simply see no pending list (the section is hidden for them).
  if (!hasPermission(membership, "can_invite_members")) {
    return boundedCollection<PendingInviteDto>([]);
  }

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("household_invites")
    .select(
      "id, invited_email, invited_phone, role, membership_type, expires_at, created_at",
    )
    .eq("household_id", householdId)
    .eq("status", "pending")
    .order("created_at", { ascending: false });

  if (error) {
    throw new InternalError("Failed to load pending invites.", {
      cause: error,
    });
  }

  const invites: PendingInviteDto[] = (data ?? []).map((row) => ({
    inviteId: row.id,
    invitedEmail: row.invited_email,
    invitedPhone: row.invited_phone,
    role: row.role,
    membershipType: row.membership_type,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
  }));

  return boundedCollection(invites);
}
