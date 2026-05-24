import "server-only";

import { requireAuthUser } from "@/lib/auth";
import {
  isMembershipActive,
  toMembershipContext,
  type MembershipRow,
} from "@/lib/auth/permissions";
import { createServerSupabaseClient } from "@/lib/db/server";
import { InternalError } from "@/lib/errors";

import {
  toCurrentUserPermissionsDto,
  type CurrentUserPermissionsDto,
} from "./dto";

/**
 * Resolve the caller's "current" household for the planning screens. A user can
 * be an active member of more than one household (`uq_one_live_membership` is
 * per user+household, doc 01), but the MVP UI operates on a single one; we pick
 * the earliest-joined active membership as the default. A household switcher is a
 * future enhancement. Returns `null` when the caller belongs to no household yet
 * (the screen then routes them into onboarding).
 *
 * Read under the per-request RLS client (`hm_select` lets a member read their own
 * row; `households_select` exposes the joined name) with the same real-time
 * expiry backstop the guards apply, so an expired guest resolves to `null`.
 */

const SELECT =
  "household_id, role, membership_type, status, expires_at, joined_at, can_view_plan, can_suggest_meals, can_change_today_menu, can_change_weekly_schedule, can_manage_grocery_list, can_invite_members, can_remove_members, can_edit_household_preferences, households(name)";

export interface CurrentHousehold {
  householdId: string;
  name: string;
  currentUserPermissions: CurrentUserPermissionsDto;
}

/** The caller's default active household, or `null` if they have none. */
export async function resolveCurrentHousehold(): Promise<CurrentHousehold | null> {
  const user = await requireAuthUser();
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from("household_members")
    .select(SELECT)
    .eq("user_id", user.id)
    .eq("status", "active")
    .order("joined_at", { ascending: true });
  if (error) {
    throw new InternalError("Failed to resolve your household.", {
      cause: error,
    });
  }

  // Apply the real-time expiry backstop in JS (matches the guards), then take
  // the first still-active membership.
  const active = (data ?? []).find((row) => isMembershipActive(row));
  if (!active) return null;

  const context = toMembershipContext(
    active.household_id,
    user.id,
    active as unknown as MembershipRow,
  );
  const household = active.households as { name: string } | null;

  return {
    householdId: active.household_id,
    name: household?.name ?? "Your household",
    currentUserPermissions: toCurrentUserPermissionsDto(context),
  };
}
