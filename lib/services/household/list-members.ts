import "server-only";

import { getActiveMembership } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/db/server";
import { InternalError, NotFoundError } from "@/lib/errors";
import { boundedCollection, type Collection } from "@/lib/http";
import { isUuid } from "@/lib/validation";

import { toMemberDto, type MemberDto } from "./dto";

/**
 * `household` service — member list (P1-8).
 *
 * Backs `GET /api/households/{householdId}/members` (design/04 § 4.4): the
 * household's active roster, each with their `display_name`, role, membership
 * type, and `can_*` permissions. A small, naturally-bounded collection, so it
 * returns the full set with no cursor.
 *
 * Two things make this endpoint unusual:
 *
 *  1. **Safe display-name projection.** `users` is RLS self-only (P0-12) — a
 *     broad co-member SELECT would over-expose email/phone (design/03 § 9). So
 *     the read goes through the `list_household_members` SECURITY DEFINER RPC,
 *     which joins to `users` past that policy but returns *only* `display_name`.
 *     The RPC re-checks the caller is an active member, so it can't enumerate
 *     another household's roster even if invoked directly.
 *
 *  2. **Existence-hiding gate.** Like the household read (P1-6), a non-member (or
 *     expired guest) gets `NotFoundError` (404) rather than `ForbiddenError`, so
 *     we never reveal a household exists across the tenancy boundary (design/04
 *     § 2). The `getActiveMembership` guard here and the RPC's internal
 *     `is_active_member` check are defense in depth.
 *
 * The RPC filters to `status = 'active'` and applies the real-time expiry test
 * (`expires_at > now()`), so an expired guest drops out immediately without
 * waiting for the `expire_guests` job (design/03 § 8).
 */
export async function listMembers(
  householdId: string,
): Promise<Collection<MemberDto>> {
  // A malformed id can't name a real household — 404 it (existence-hiding)
  // before it reaches the RPC as an invalid-uuid error.
  if (!isUuid(householdId)) {
    throw new NotFoundError("Household not found.");
  }

  // Active-membership gate. `null` means "authenticated but not an active
  // member" — surfaced as 404, indistinguishable from "no such household".
  const membership = await getActiveMembership(householdId);
  if (!membership) {
    throw new NotFoundError("Household not found.");
  }

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("list_household_members", {
    p_household_id: householdId,
  });

  if (error) {
    throw new InternalError("Failed to load household members.", {
      cause: error,
    });
  }

  const members = (data ?? []).map(toMemberDto);
  return boundedCollection(members);
}
