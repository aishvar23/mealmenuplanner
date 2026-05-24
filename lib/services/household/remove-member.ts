import "server-only";

import { getActiveMembership, hasPermission } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/db/server";
import {
  ConflictError,
  ForbiddenError,
  InternalError,
  NotFoundError,
} from "@/lib/errors";
import { isUuid } from "@/lib/validation";

import type { RemoveMemberResult } from "./dto";
import { loadTargetMember } from "./member-lookup";

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

  const { error } = await supabase
    .from("household_members")
    .update({ status: "removed" })
    .eq("id", memberId)
    .eq("household_id", householdId);
  if (error) {
    throw new InternalError("Failed to remove member.", { cause: error });
  }

  // P8 hook: member_removed activity event + notification to remaining members.
  return { memberId, status: "removed" };
}
