import "server-only";

import { cache } from "react";

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
 * per user+household, doc 01). They pick which one they're viewing via the
 * household switcher (BETA): the `users.active_household_id` they last switched
 * to, else their `preferred_household_id` default, else — for a user who has set
 * neither — the earliest-joined active membership (the historical default, so
 * existing single-household users are unaffected). Returns `null` when the caller
 * belongs to no household yet (the screen then routes them into onboarding).
 *
 * Read under the per-request RLS client (`hm_select` lets a member read their own
 * row; `households_select` exposes the joined name; `users_select_self` exposes
 * the two pointers) with the same real-time expiry backstop the guards apply, so
 * an expired guest resolves to `null`.
 */

const SELECT =
  "household_id, role, membership_type, status, expires_at, joined_at, can_view_plan, can_suggest_meals, can_change_today_menu, can_change_weekly_schedule, can_manage_grocery_list, can_invite_members, can_remove_members, can_edit_household_preferences, households(name)";

export interface CurrentHousehold {
  householdId: string;
  name: string;
  currentUserPermissions: CurrentUserPermissionsDto;
}

/** One household the caller actively belongs to, for the switcher/management UI. */
export interface UserHouseholdSummary {
  householdId: string;
  name: string;
  role: MembershipRow["role"];
  /** The household currently being viewed (`users.active_household_id`, resolved). */
  isActive: boolean;
  /** The caller's default-on-login household (`users.preferred_household_id`). */
  isPreferred: boolean;
}

type MembershipWithHousehold = MembershipRow & {
  household_id: string;
  joined_at: string | null;
  households: { name: string } | null;
};

/** The caller's `active`/`preferred` household pointers (both nullable). */
async function loadHouseholdPointers(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  userId: string,
): Promise<{ activeId: string | null; preferredId: string | null }> {
  const { data, error } = await supabase
    .from("users")
    .select("active_household_id, preferred_household_id")
    .eq("id", userId)
    .maybeSingle();
  if (error) {
    throw new InternalError("Failed to resolve your household.", {
      cause: error,
    });
  }
  return {
    activeId: data?.active_household_id ?? null,
    preferredId: data?.preferred_household_id ?? null,
  };
}

/** The caller's still-active memberships, earliest-joined first. */
async function loadActiveMemberships(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  userId: string,
): Promise<MembershipWithHousehold[]> {
  const { data, error } = await supabase
    .from("household_members")
    .select(SELECT)
    .eq("user_id", userId)
    .eq("status", "active")
    .order("joined_at", { ascending: true });
  if (error) {
    throw new InternalError("Failed to resolve your household.", {
      cause: error,
    });
  }
  return (data ?? []).filter((row) =>
    isMembershipActive(row),
  ) as unknown as MembershipWithHousehold[];
}

/**
 * The caller's current household, or `null` if they have none. Wrapped in React
 * `cache()` (BUG-016 / PERF-004): the app-shell layout and the page both resolve
 * it per render, so deduping collapses the reads into one.
 */
export const resolveCurrentHousehold = cache(
  async function resolveCurrentHousehold(): Promise<CurrentHousehold | null> {
    const user = await requireAuthUser();
    const supabase = await createServerSupabaseClient();

    const [memberships, pointers] = await Promise.all([
      loadActiveMemberships(supabase, user.id),
      loadHouseholdPointers(supabase, user.id),
    ]);
    if (memberships.length === 0) return null;

    // active pointer → preferred pointer → earliest-joined (already ordered).
    const active =
      memberships.find((m) => m.household_id === pointers.activeId) ??
      memberships.find((m) => m.household_id === pointers.preferredId) ??
      memberships[0];
    if (!active) return null;

    const context = toMembershipContext(
      active.household_id,
      user.id,
      active as unknown as MembershipRow,
    );

    return {
      householdId: active.household_id,
      name: active.households?.name ?? "Your household",
      currentUserPermissions: toCurrentUserPermissionsDto(context),
    };
  },
);

/**
 * Every household the caller is an active member of, earliest-joined first, each
 * tagged with whether it is the resolved `active` (currently-viewed) one and the
 * `preferred` default. Powers the household switcher / management page (BETA).
 * Empty when the caller belongs to no household.
 */
export const listUserHouseholds = cache(
  async function listUserHouseholds(): Promise<UserHouseholdSummary[]> {
    const user = await requireAuthUser();
    const supabase = await createServerSupabaseClient();

    const [memberships, pointers] = await Promise.all([
      loadActiveMemberships(supabase, user.id),
      loadHouseholdPointers(supabase, user.id),
    ]);
    if (memberships.length === 0) return [];

    // Mirror resolveCurrentHousehold's selection so the "active" tag matches the
    // household the rest of the app actually shows.
    const resolved =
      memberships.find((m) => m.household_id === pointers.activeId) ??
      memberships.find((m) => m.household_id === pointers.preferredId) ??
      memberships[0];
    const activeId = resolved?.household_id;

    return memberships.map((m) => ({
      householdId: m.household_id,
      name: m.households?.name ?? "Your household",
      role: m.role,
      isActive: m.household_id === activeId,
      isPreferred: m.household_id === pointers.preferredId,
    }));
  },
);
