import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { MemberRole, MemberStatus } from "@/lib/auth/permissions";
import type { Database } from "@/lib/db/database.types";
import { InternalError, NotFoundError } from "@/lib/errors";

import { toMemberDto, type MemberDto } from "./dto";

/**
 * Shared member-row helpers for the member-management services (P6-5/6/7). Both
 * the target lookup (for authorization decisions) and the after-write DTO
 * re-read run under the per-request RLS client the caller already holds — the
 * caller is an active member, so `hm_select` lets them read the roster.
 */

type ServerClient = SupabaseClient<Database>;

/** The fields a management action needs about its target member. */
export interface TargetMember {
  id: string;
  userId: string;
  role: MemberRole;
  status: MemberStatus;
}

/**
 * Load an **active** member row in `householdId` by member id. Returns
 * `NotFoundError` (existence-hiding) for an absent or non-active target, so a
 * removed/left/expired member can't be re-managed and a cross-household id can't
 * be probed.
 */
export async function loadTargetMember(
  supabase: ServerClient,
  householdId: string,
  memberId: string,
): Promise<TargetMember> {
  const { data, error } = await supabase
    .from("household_members")
    .select("id, user_id, role, status")
    .eq("id", memberId)
    .eq("household_id", householdId)
    .eq("status", "active")
    .maybeSingle();

  if (error) {
    throw new InternalError("Failed to load member.", { cause: error });
  }
  if (!data) {
    throw new NotFoundError("Member not found.");
  }
  return {
    id: data.id,
    userId: data.user_id,
    role: data.role,
    status: data.status,
  };
}

/**
 * Re-read one member as a full DTO (with display name) after a mutation, via the
 * `list_household_members` safe-projection RPC (P1-8) — the same source the
 * member list uses, so the shape stays identical. The member must still be in the
 * active roster (true after a role/permission change).
 */
export async function findMemberDto(
  supabase: ServerClient,
  householdId: string,
  memberId: string,
): Promise<MemberDto> {
  const { data, error } = await supabase.rpc("list_household_members", {
    p_household_id: householdId,
  });
  if (error) {
    throw new InternalError("Failed to load the updated member.", {
      cause: error,
    });
  }
  const row = (data ?? []).find((r) => r.member_id === memberId);
  if (!row) {
    throw new InternalError("Updated member not found in the roster.");
  }
  return toMemberDto(row);
}
