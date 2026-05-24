import "server-only";

import { getActiveMembership } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/db/server";
import { ConflictError, InternalError, NotFoundError } from "@/lib/errors";
import { isUuid } from "@/lib/validation";

import type { LeaveHouseholdResult } from "./dto";

/**
 * `household` service — leave a household (P6-7, design/04 § 4.4, design/07 § 11).
 * Any active member acting on self: the row goes `active → left`, access is
 * revoked, attribution is preserved. An **owner cannot leave** — that would
 * orphan the household (exactly-one-owner invariant) — so they must transfer
 * ownership first (`PATCH .../members/{id}` with `role: "owner"`). Runs under the
 * per-request RLS client (`hm_update` allows `user_id = auth.uid()`).
 */
export async function leaveHousehold(
  householdId: string,
): Promise<LeaveHouseholdResult> {
  if (!isUuid(householdId)) throw new NotFoundError("Household not found.");

  const membership = await getActiveMembership(householdId);
  if (!membership) throw new NotFoundError("Household not found.");

  if (membership.role === "owner") {
    throw new ConflictError(
      "Transfer ownership before leaving the household.",
      { reason: "owner_must_transfer" },
    );
  }

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase
    .from("household_members")
    .update({ status: "left" })
    .eq("household_id", householdId)
    .eq("user_id", membership.userId)
    .eq("status", "active");
  if (error) {
    throw new InternalError("Failed to leave the household.", { cause: error });
  }

  // P8 hook: member_left activity event + notification to the owner.
  return { householdId, status: "left" };
}
