import "server-only";

import {
  defaultPermissionsForRole,
  getActiveMembership,
  hasPermission,
  requireAuthUser,
} from "@/lib/auth";
import type { Database } from "@/lib/db/database.types";
import { createServerSupabaseClient } from "@/lib/db/server";
import { actorDisplayName, safeEmitHouseholdEvent } from "@/lib/events";
import {
  ConflictError,
  ForbiddenError,
  InternalError,
  NotFoundError,
} from "@/lib/errors";
import type { JsonObject } from "@/lib/http";
import { isUuid } from "@/lib/validation";

import type { MemberDto } from "./dto";
import { findMemberDto, loadTargetMember } from "./member-lookup";
import { validateMemberUpdate } from "./validate-member";

/**
 * `household` service — update a member's role/permissions (P6-5, design/04
 * § 4.4, design/07 § 2, § 11). Gated by `can_remove_members` (the membership-
 * management permission; owner-only by default).
 *
 * Three shapes of change:
 *
 *  1. **Ownership transfer** — `role: "owner"` on a non-owner. Only the current
 *     owner may do it; it runs through the `transfer_ownership` SECURITY DEFINER
 *     function (P6-5/8) which atomically promotes the target and demotes the
 *     outgoing owner, preserving exactly-one-owner.
 *  2. **The owner is otherwise immutable here** — an owner's role/flags can't be
 *     edited via this path (design/07 § 2); changing who owns is a transfer.
 *  3. **Plain edit** — role to admin/member/viewer and/or flag toggles on a
 *     non-owner. A role change re-applies that role's default flag bundle, then
 *     any explicit overrides win, under the per-request RLS client (`hm_update`
 *     allows the holder of `can_remove_members`).
 *
 * Non-member/absent → `NotFoundError`; lacking the flag → `ForbiddenError`.
 */

type MemberUpdateRow =
  Database["public"]["Tables"]["household_members"]["Update"];

const PG_INSUFFICIENT_PRIVILEGE = "42501"; // transfer by a non-owner → 403
const PG_NO_DATA_FOUND = "P0002"; // target vanished → 404
const PG_CHECK_VIOLATION = "23514"; // target already owner / self → 409

export async function updateMember(
  householdId: string,
  memberId: string,
  body: JsonObject,
): Promise<MemberDto> {
  if (!isUuid(householdId) || !isUuid(memberId)) {
    throw new NotFoundError("Member not found.");
  }

  const membership = await getActiveMembership(householdId);
  if (!membership) throw new NotFoundError("Member not found.");
  if (!hasPermission(membership, "can_remove_members")) {
    throw new ForbiddenError("You don't have permission to manage members.");
  }

  const update = validateMemberUpdate(body);
  const supabase = await createServerSupabaseClient();
  const target = await loadTargetMember(supabase, householdId, memberId);

  // (1) Ownership transfer.
  if (update.role === "owner") {
    if (target.role === "owner") {
      throw new ConflictError("That member is already the owner.", {
        reason: "already_owner",
      });
    }
    if (membership.role !== "owner") {
      throw new ForbiddenError("Only the owner can transfer ownership.");
    }
    const { error } = await supabase.rpc("transfer_ownership", {
      p_household_id: householdId,
      p_target_member_id: memberId,
    });
    if (error) {
      if (error.code === PG_INSUFFICIENT_PRIVILEGE) {
        throw new ForbiddenError("Only the owner can transfer ownership.", {
          cause: error,
        });
      }
      if (error.code === PG_NO_DATA_FOUND) {
        throw new NotFoundError("Member not found.", { cause: error });
      }
      if (error.code === PG_CHECK_VIOLATION) {
        throw new ConflictError("That member is already the owner.", {
          reason: "already_owner",
        });
      }
      throw new InternalError("Failed to transfer ownership.", {
        cause: error,
      });
    }
    const promoted = await findMemberDto(supabase, householdId, memberId);
    const actor = await requireAuthUser();
    await safeEmitHouseholdEvent(supabase, {
      householdId,
      eventType: "role_changed",
      entityType: "household_member",
      entityId: memberId,
      newValue: { role: "owner" },
      extraRecipientIds: [target.userId],
      vars: {
        actorName: actorDisplayName(actor),
        memberName: promoted.displayName ?? "a member",
        newRole: promoted.role,
      },
    });
    return promoted;
  }

  // (2) The owner is immutable via this path.
  if (target.role === "owner") {
    throw new ConflictError(
      "The owner's role and permissions can't be changed here. Transfer ownership instead.",
      { reason: "owner_immutable" },
    );
  }

  // (3) Plain edit. A role change resets to that role's defaults first; explicit
  // flag overrides then win. Keys are snake_case = column names.
  let patch: MemberUpdateRow = {};
  if (update.role !== null) {
    patch = { ...defaultPermissionsForRole(update.role), role: update.role };
  }
  patch = { ...patch, ...update.permissionOverrides };

  const { error } = await supabase
    .from("household_members")
    .update(patch)
    .eq("id", memberId)
    .eq("household_id", householdId);
  if (error) {
    throw new InternalError("Failed to update member.", { cause: error });
  }

  const dto = await findMemberDto(supabase, householdId, memberId);
  const actor = await requireAuthUser();

  // A role change is `role_changed`; a flag-only change is `permissions_changed`
  // (design/09 § 2). Both notify the affected member + active members minus actor.
  const roleChanged = update.role !== null;
  await safeEmitHouseholdEvent(supabase, {
    householdId,
    eventType: roleChanged ? "role_changed" : "permissions_changed",
    entityType: "household_member",
    entityId: memberId,
    newValue: roleChanged
      ? { role: dto.role }
      : { permissions: update.permissionOverrides },
    extraRecipientIds: [target.userId],
    vars: {
      actorName: actorDisplayName(actor),
      memberName: dto.displayName ?? "a member",
      newRole: dto.role,
    },
  });

  return dto;
}
