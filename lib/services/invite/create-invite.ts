import "server-only";

import { getActiveMembership, hasPermission } from "@/lib/auth";
import type { Json } from "@/lib/db/database.types";
import { createServerSupabaseClient } from "@/lib/db/server";
import { ForbiddenError, InternalError, NotFoundError } from "@/lib/errors";
import type { JsonObject } from "@/lib/http";
import { isUuid } from "@/lib/validation";

import type { CreateInviteResult } from "./dto";
import { generateInviteToken, hashInviteToken } from "./token";
import { validateCreateInvite } from "./validate";

/**
 * `invite` service — create invite (P6-1, design/04 § 4.3, design/07 § 6).
 *
 * Gated by `can_invite_members`. Unlike the accept/preview RPCs, the insert runs
 * under the per-request RLS client: the inviter IS an active member, so the
 * `hi_insert` policy (`has_permission(household_id, 'can_invite_members')`)
 * passes — no SECURITY DEFINER bootstrap needed.
 *
 * The token is a bearer secret: a fresh high-entropy plaintext is generated, only
 * its `sha256` hash is stored (design/03 § 7, lib/services/invite/token.ts), and
 * the plaintext is returned exactly once inside `inviteLink`. The invite's full
 * resolved permission set (role defaults + overrides) is stored on the row so the
 * accept RPC just copies it onto the new membership.
 *
 * A malformed id or a non-member is surfaced as `NotFoundError` (existence-hiding,
 * design/04 § 2, matching the household read); a member lacking the flag gets
 * `ForbiddenError`.
 */
export async function createInvite(
  householdId: string,
  body: JsonObject,
  appBaseUrl: string,
): Promise<CreateInviteResult> {
  if (!isUuid(householdId)) throw new NotFoundError("Household not found.");

  const membership = await getActiveMembership(householdId);
  if (!membership) throw new NotFoundError("Household not found.");
  if (!hasPermission(membership, "can_invite_members")) {
    throw new ForbiddenError("You don't have permission to invite members.");
  }

  // Validate AFTER authorization so an unauthorized caller learns nothing extra.
  const invite = validateCreateInvite(body);

  const plaintext = generateInviteToken();
  const tokenHash = hashInviteToken(plaintext);

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("household_invites")
    .insert({
      household_id: householdId,
      invited_by_user_id: membership.userId,
      invited_email: invite.invitedEmail,
      invited_phone: invite.invitedPhone,
      invite_token: tokenHash,
      role: invite.role,
      membership_type: invite.membershipType,
      permissions: invite.permissions as unknown as Json,
      starts_at: invite.startsAt,
      expires_at: invite.expiresAt,
      status: "pending",
    })
    .select("id")
    .single();

  if (error || !data) {
    throw new InternalError("Failed to create invite.", { cause: error });
  }

  // P8 hook: hand the invite to the notification service to email/SMS the link
  // (design/07 § 6, P8-5). Until then the inviter shares `inviteLink` directly.
  const inviteLink = `${appBaseUrl.replace(/\/+$/, "")}/invite/${plaintext}`;

  return { inviteId: data.id, inviteLink };
}
