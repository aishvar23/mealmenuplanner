import "server-only";

import { requireAuthUser } from "@/lib/auth";
import type { Database } from "@/lib/db/database.types";
import { createServerSupabaseClient } from "@/lib/db/server";
import {
  ConflictError,
  InternalError,
  NotFoundError,
  UnauthenticatedError,
} from "@/lib/errors";
import { boundedCollection, type Collection } from "@/lib/http";
import type { MemberDto } from "@/packages/shared/provider";

/**
 * Provider member roster + approval lifecycle (MP-A-102, contract 03 § 8). All
 * four operations go through the SECURITY DEFINER RPCs (pmp_9), which self-gate on
 * `is_provider_owner` and own every membership transition (pmem writes are
 * RPC-only since pmp_7b). `list_provider_members` additionally projects member
 * identity across the self-only `users` RLS — the owner cannot join it directly.
 */

type MemberRow =
  Database["public"]["Functions"]["list_provider_members"]["Returns"][number];

function toMemberDto(row: MemberRow): MemberDto {
  return {
    memberId: row.member_id,
    userId: row.user_id,
    displayName: row.display_name,
    email: row.email,
    phone: row.phone,
    role: row.role,
    status: row.status,
    approvedAt: row.approved_at,
    joinedAt: row.joined_at,
  };
}

/** Read the full roster (owner only). A non-owner caller gets a 404 (no leak). */
export async function listProviderMembers(
  providerId: string,
): Promise<Collection<MemberDto>> {
  await requireAuthUser();
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("list_provider_members", {
    p_provider_id: providerId,
  });
  if (error) {
    if (error.code === "28000") throw new UnauthenticatedError();
    if (error.code === "42501") throw new NotFoundError("Provider not found.");
    throw new InternalError("Failed to load members.", { cause: error });
  }
  return boundedCollection((data ?? []).map(toMemberDto));
}

/** Re-read one member after a lifecycle mutation, for the response DTO. */
async function readMember(
  providerId: string,
  memberId: string,
): Promise<MemberDto> {
  const collection = await listProviderMembers(providerId);
  const member = collection.data.find((m) => m.memberId === memberId);
  if (!member) {
    throw new InternalError("Member updated but could not be read back.");
  }
  return member;
}

function mapLifecycleError(error: { code?: string; cause?: unknown }): never {
  if (error.code === "28000") throw new UnauthenticatedError();
  // Not the owner → existence-hiding 404, same as an unknown member.
  if (error.code === "42501" || error.code === "P0002") {
    throw new NotFoundError("Member not found.", { cause: error });
  }
  if (error.code === "23514") {
    throw new ConflictError(
      "This member can't be updated in their current state.",
      {
        reason: "provider_member_not_pending",
      },
    );
  }
  throw new InternalError("Failed to update the member.", { cause: error });
}

async function runLifecycle(
  rpc:
    | "approve_provider_member"
    | "reject_provider_member"
    | "remove_provider_member",
  providerId: string,
  memberId: string,
): Promise<MemberDto> {
  await requireAuthUser();
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.rpc(rpc, {
    p_provider_id: providerId,
    p_member_id: memberId,
  });
  if (error) mapLifecycleError(error);
  return readMember(providerId, memberId);
}

/** `POST .../members/{id}/approve` — awaiting_approval → active. */
export function approveProviderMember(
  providerId: string,
  memberId: string,
): Promise<MemberDto> {
  return runLifecycle("approve_provider_member", providerId, memberId);
}

/** `POST .../members/{id}/reject` — awaiting_approval → rejected. */
export function rejectProviderMember(
  providerId: string,
  memberId: string,
): Promise<MemberDto> {
  return runLifecycle("reject_provider_member", providerId, memberId);
}

/** `POST .../members/{id}/remove` — active|awaiting → removed. */
export function removeProviderMember(
  providerId: string,
  memberId: string,
): Promise<MemberDto> {
  return runLifecycle("remove_provider_member", providerId, memberId);
}
