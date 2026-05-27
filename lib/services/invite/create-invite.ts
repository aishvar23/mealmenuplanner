import "server-only";

import {
  getActiveMembership,
  hasPermission,
  requireAuthUser,
} from "@/lib/auth";
import type { Json } from "@/lib/db/database.types";
import { createServerSupabaseClient } from "@/lib/db/server";
import {
  actorDisplayName,
  safeEmitHouseholdEvent,
  sendInviteEmail,
} from "@/lib/events";
import { ForbiddenError, InternalError, NotFoundError } from "@/lib/errors";
import type { JsonObject } from "@/lib/http";
import { isUuid } from "@/lib/validation";

import type { CreateInviteResult, InviteEmailStatus } from "./dto";
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

  const inviteLink = `${appBaseUrl.replace(/\/+$/, "")}/invite/${plaintext}`;

  // Notify the household + email the invitee (design/09 § 2 `member_invited`, § 5).
  const actor = await requireAuthUser();
  const { data: household } = await supabase
    .from("households")
    .select("name")
    .eq("id", householdId)
    .maybeSingle();
  const householdName = household?.name ?? "your household";
  const invitedLabel = invite.invitedEmail ?? invite.invitedPhone ?? "someone";

  // In-app fan-out to the existing active members (the actor is excluded).
  await safeEmitHouseholdEvent(supabase, {
    householdId,
    eventType: "member_invited",
    entityType: "household_invite",
    entityId: data.id,
    vars: {
      actorName: actorDisplayName(actor),
      memberName: invitedLabel,
      householdName,
    },
  });

  // The one external send in MVP: email the invite link to the invitee
  // (best-effort; the link is also returned for manual sharing). The outcome is
  // returned so the UI can confirm the email went out, or prompt the inviter to
  // share the link manually when email isn't configured (BUG-018).
  let emailStatus: InviteEmailStatus = "no_recipient";
  if (invite.invitedEmail) {
    emailStatus = await sendInviteEmail({
      toEmail: invite.invitedEmail,
      inviteLink,
      householdName,
      inviterName: actorDisplayName(actor),
      expiresAt: invite.expiresAt,
    });
  }

  return { inviteId: data.id, inviteLink, emailStatus };
}
