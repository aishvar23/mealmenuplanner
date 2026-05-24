import "server-only";

import {
  getActiveMembership,
  hasPermission,
  requireAuthUser,
} from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/db/server";
import { actorDisplayName, safeEmitHouseholdEvent } from "@/lib/events";
import {
  ConflictError,
  ForbiddenError,
  InternalError,
  NotFoundError,
} from "@/lib/errors";
import { isUuid } from "@/lib/validation";

import type { RemoveMemberResult } from "./dto";
import { findMemberDto, loadTargetMember } from "./member-lookup";

/**
 * `household` service — remove a member (P6-6, design/04 § 4.4, design/07 § 10).
 * Gated by `can_remove_members`. Soft state: the row goes `active → removed`
 * (history/attribution preserved), so `is_active_member` denies the removed user
 * on their next request. The owner can't be removed (transfer instead), and a
 * member can't remove themselves (use leave). Runs under the per-request RLS
 * client (`hm_update` allows the holder of `can_remove_members`).
 */
export async function removeMember(
  householdId: string,
  memberId: string,
): Promise<RemoveMemberResult> {
  if (!isUuid(householdId) || !isUuid(memberId)) {
    throw new NotFoundError("Member not found.");
  }

  const membership = await getActiveMembership(householdId);
  if (!membership) throw new NotFoundError("Member not found.");
  if (!hasPermission(membership, "can_remove_members")) {
    throw new ForbiddenError("You don't have permission to remove members.");
  }

  const supabase = await createServerSupabaseClient();
  const target = await loadTargetMember(supabase, householdId, memberId);

  if (target.role === "owner") {
    throw new ConflictError(
      "The owner can't be removed. Transfer ownership first.",
      { reason: "owner" },
    );
  }
  if (target.userId === membership.userId) {
    throw new ConflictError("You can't remove yourself. Use Leave instead.", {
      reason: "self",
    });
  }

  // Resolve the target's display name while they are still in the active roster
  // (the safe-projection RPC only returns active members).
  const targetDto = await findMemberDto(supabase, householdId, memberId);
  const actor = await requireAuthUser();

  const { error } = await supabase
    .from("household_members")
    .update({ status: "removed" })
    .eq("id", memberId)
    .eq("household_id", householdId);
  if (error) {
    throw new InternalError("Failed to remove member.", { cause: error });
  }

  // Notify remaining members AND the removed member (design/09 § 2 recipient note)
  // — the latter via `extraRecipientIds`, since they are no longer active.
  await safeEmitHouseholdEvent(supabase, {
    householdId,
    eventType: "member_removed",
    entityType: "household_member",
    entityId: memberId,
    oldValue: { status: "active" },
    newValue: { status: "removed" },
    extraRecipientIds: [target.userId],
    vars: {
      actorName: actorDisplayName(actor),
      memberName: targetDto.displayName ?? "a member",
    },
  });

  return { memberId, status: "removed" };
}
