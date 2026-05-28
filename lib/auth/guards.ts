import "server-only";

import { cache } from "react";

import type { User } from "@supabase/supabase-js";

import { createServerSupabaseClient } from "@/lib/db/server";
import { ForbiddenError, InternalError } from "@/lib/errors";

import { isAdminUser } from "./admin";
import {
  hasPermission,
  isMembershipActive,
  toMembershipContext,
  type MembershipContext,
  type Permission,
} from "./permissions";
import { requireAuthUser } from "./session";

/**
 * Service-layer permission guards — the **primary** authorization gate
 * (design/03 § 3, § 6). Each guard runs against the per-request, RLS-scoped
 * Supabase client, so Postgres RLS independently re-checks the same rule as a
 * backstop. The guards exist so a denial is a clean, typed `ForbiddenError`
 * rather than an ambiguous empty result set.
 *
 * Layering, per request:
 *   1. `requireAuthUser()` — verified session, else `UnauthenticatedError` (401).
 *   2. active-membership check (incl. real-time `expires_at`), else 403.
 *   3. for writes, the specific `can_*` flag, else 403.
 */

// Columns needed to decide access + build the success context. Kept in sync
// with `MembershipRow` in ./permissions. Must stay a single string literal so
// supabase-js can statically infer the returned row shape (a concatenation
// widens to `string` and loses that inference).
const MEMBERSHIP_SELECT =
  "role, membership_type, status, expires_at, can_view_plan, can_suggest_meals, can_change_today_menu, can_change_weekly_schedule, can_manage_grocery_list, can_invite_members, can_remove_members, can_edit_household_preferences";

/**
 * Load the caller's **active** membership in `householdId`, or `null` if they
 * are authenticated but not an active, non-expired member. Authentication is a
 * precondition — a missing session throws `UnauthenticatedError` — so the `null`
 * return means exactly "not a member" and never "not signed in". This is the
 * non-throwing primitive the other guards build on; read endpoints that prefer a
 * 404 over a 403 (to avoid leaking household existence, design/04 § 2) use it
 * directly and translate `null` to `NotFoundError`.
 *
 * Wrapped in React `cache()` (BUG-016 / PERF-004): a single render resolves a
 * household's membership from several guards/services, so deduping per
 * `householdId` per request collapses those into one query. `cache()` is
 * request-scoped (and a no-op outside a render), so the result is unchanged.
 */
export const getActiveMembership = cache(async function getActiveMembership(
  householdId: string,
): Promise<MembershipContext | null> {
  const user = await requireAuthUser();
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from("household_members")
    .select(MEMBERSHIP_SELECT)
    .eq("household_id", householdId)
    .eq("user_id", user.id)
    .eq("status", "active")
    .maybeSingle();

  if (error) {
    throw new InternalError("Failed to resolve household membership.", {
      cause: error,
    });
  }
  if (!data) return null;

  // Real-time guest-expiry backstop: the row is `status = 'active'`, but a guest
  // past `expires_at` is no longer active even before the hourly job flips it
  // (design/03 § 8). Self-sufficient — correct even under a non-RLS client.
  if (!isMembershipActive(data)) return null;

  return toMembershipContext(householdId, user.id, data);
});

/**
 * Assert the caller is an active member of `householdId`, returning their
 * membership context. Throws `ForbiddenError` if they are not (non-member,
 * removed/left, or expired guest) — matching node E2 of the design/03 § 6 flow.
 * Use for "any active member" reads/writes that need no extra `can_*` flag.
 */
export async function requireActiveMember(
  householdId: string,
): Promise<MembershipContext> {
  const membership = await getActiveMembership(householdId);
  if (!membership) {
    throw new ForbiddenError("You are not an active member of this household.");
  }
  return membership;
}

/**
 * Assert the caller is an active member of `householdId` **and** holds
 * `permission`, returning their membership context. Throws `ForbiddenError` for
 * either failure (design/03 § 6, nodes E2/E3). The `can_*` flag is the source of
 * truth — owners simply have every flag set at creation (design/03 § 4).
 */
export async function requirePermission(
  householdId: string,
  permission: Permission,
): Promise<MembershipContext> {
  const membership = await requireActiveMember(householdId);
  if (!hasPermission(membership, permission)) {
    throw new ForbiddenError(
      "You don't have permission to perform this action.",
    );
  }
  return membership;
}

/**
 * Assert the caller is an authenticated **operator** (holds the `admin`
 * `app_role`), returning the verified user. Throws `UnauthenticatedError` (no
 * session) or `ForbiddenError` (signed in, not an admin).
 *
 * This is the primary gate for the operator console and the content-write APIs
 * (P3, docs/06). It is independent of household membership — operators manage
 * the global catalog, not any single household. The content tables' RLS
 * `app_role='admin'` write policy (design/03 § 5) is the database-level
 * backstop; admin services run on the service-role client, so this guard is the
 * gate that actually protects content authoring.
 */
export async function requireAdmin(): Promise<User> {
  const user = await requireAuthUser();
  if (!isAdminUser(user)) {
    throw new ForbiddenError("Operator access is required.");
  }
  return user;
}
