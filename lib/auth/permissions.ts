/**
 * The household permission model — pure, runtime-agnostic.
 *
 * Holds the permission vocabulary (`PERMISSION_FLAGS`), the membership-context
 * shape the guards hand back, and the pure predicates that decide "is this
 * membership active right now?" and "does it hold this permission?". Mirrors the
 * `is_active_member()` / `has_permission()` SQL helpers (design/01) so the
 * service layer and Postgres RLS apply the same rule — RLS stays the backstop,
 * never the only gate (design/03 § 3, § 6).
 *
 * Kept free of `server-only`, Supabase, and `next/*` imports so it is trivially
 * unit-testable and reusable anywhere; the I/O that loads a membership row lives
 * in `./guards.ts`.
 */

import type { Database } from "@/lib/db/database.types";

type HouseholdMemberRow =
  Database["public"]["Tables"]["household_members"]["Row"];

export type MemberRole = Database["public"]["Enums"]["member_role"];
export type MembershipType = Database["public"]["Enums"]["membership_type"];
export type MemberStatus = Database["public"]["Enums"]["member_status"];

/**
 * The eight per-member permission flags, in the order they appear on
 * `household_members` (design/01) and the role→permission matrix (design/03 § 4).
 * These are the **source of truth at runtime** — a role is just the default
 * bundle applied at invite/creation time; individual flags can be overridden.
 */
export const PERMISSION_FLAGS = [
  "can_view_plan",
  "can_suggest_meals",
  "can_change_today_menu",
  "can_change_weekly_schedule",
  "can_manage_grocery_list",
  "can_invite_members",
  "can_remove_members",
  "can_edit_household_preferences",
] as const;

/** A `household_members.can_*` permission flag name. */
export type Permission = (typeof PERMISSION_FLAGS)[number];

/** The subset of a `household_members` row the guards need to decide access. */
export type MembershipRow = Pick<
  HouseholdMemberRow,
  "role" | "membership_type" | "status" | "expires_at" | Permission
>;

/**
 * The verified, active membership of a user in a household — what every guard
 * returns on success. Callers reuse it to render `currentUserPermissions`
 * (design/04 § 4.1) and to branch on role without re-querying.
 */
export interface MembershipContext {
  householdId: string;
  userId: string;
  role: MemberRole;
  membershipType: MembershipType;
  /** Null for permanent members; a deadline for temporary guests. */
  expiresAt: string | null;
  /** The eight `can_*` flags, exactly as stored on the row. */
  permissions: Record<Permission, boolean>;
}

/**
 * Real-time active-membership test, mirroring `is_active_member()` (design/01):
 * `status = 'active'` **and** not past `expires_at`. The expiry half is what
 * makes guest expiry real-time — a guest loses access the instant their window
 * passes, without waiting for the hourly `expire_guests` job (design/03 § 8).
 */
export function isMembershipActive(
  row: Pick<MembershipRow, "status" | "expires_at">,
  now: Date = new Date(),
): boolean {
  if (row.status !== "active") return false;
  if (row.expires_at === null) return true;
  return new Date(row.expires_at).getTime() > now.getTime();
}

/** Build the flag map from a membership row. */
export function toPermissionMap(
  row: Pick<MembershipRow, Permission>,
): Record<Permission, boolean> {
  return {
    can_view_plan: row.can_view_plan,
    can_suggest_meals: row.can_suggest_meals,
    can_change_today_menu: row.can_change_today_menu,
    can_change_weekly_schedule: row.can_change_weekly_schedule,
    can_manage_grocery_list: row.can_manage_grocery_list,
    can_invite_members: row.can_invite_members,
    can_remove_members: row.can_remove_members,
    can_edit_household_preferences: row.can_edit_household_preferences,
  };
}

/** Assemble the success context for an (already verified active) membership. */
export function toMembershipContext(
  householdId: string,
  userId: string,
  row: MembershipRow,
): MembershipContext {
  return {
    householdId,
    userId,
    role: row.role,
    membershipType: row.membership_type,
    expiresAt: row.expires_at,
    permissions: toPermissionMap(row),
  };
}

/** Does this membership hold the given permission? Mirrors `has_permission()`. */
export function hasPermission(
  context: MembershipContext,
  permission: Permission,
): boolean {
  return context.permissions[permission] === true;
}

/**
 * Each permission flag's camelCase API key (design/04 § 1 casing boundary). The
 * inverse of the hand-written mapping in `toCanFlagsDto`; kept here so the invite
 * and member-update validators can read camelCase override input without
 * re-stating the mapping.
 */
export const PERMISSION_CAMEL_KEYS: Record<Permission, string> = {
  can_view_plan: "canViewPlan",
  can_suggest_meals: "canSuggestMeals",
  can_change_today_menu: "canChangeTodayMenu",
  can_change_weekly_schedule: "canChangeWeeklySchedule",
  can_manage_grocery_list: "canManageGroceryList",
  can_invite_members: "canInviteMembers",
  can_remove_members: "canRemoveMembers",
  can_edit_household_preferences: "canEditHouseholdPreferences",
};

/**
 * Pull the `can_*` overrides out of a camelCase input object. Pure and
 * non-throwing: it reads only the eight known camelCase flag keys (unknown keys
 * — e.g. a sibling `role` field — are ignored), records a `permissions.<key>`
 * issue for any present-but-non-boolean value, and returns the validated subset.
 * Shared by the invite create validator (reads `body.permissions`) and the
 * member-update validator (reads the body directly, where flags are top-level).
 */
export function parsePermissionOverrides(raw: unknown): {
  overrides: Partial<Record<Permission, boolean>>;
  invalidFields: string[];
} {
  const overrides: Partial<Record<Permission, boolean>> = {};
  const invalidFields: string[] = [];
  if (raw == null) return { overrides, invalidFields };
  if (typeof raw !== "object" || Array.isArray(raw)) {
    return { overrides, invalidFields: ["permissions"] };
  }

  const obj = raw as Record<string, unknown>;
  for (const flag of PERMISSION_FLAGS) {
    const value = obj[PERMISSION_CAMEL_KEYS[flag]];
    if (value === undefined) continue;
    if (typeof value !== "boolean") {
      invalidFields.push(`permissions.${PERMISSION_CAMEL_KEYS[flag]}`);
      continue;
    }
    overrides[flag] = value;
  }
  return { overrides, invalidFields };
}

/**
 * The role → default `can_*` flag bundle (design/03 § 4, design/07 § 2). A role
 * is only the default bundle applied at invite/accept and role-change time; the
 * individual flags are the runtime source of truth and can be overridden per
 * member afterwards. The `owner` and `viewer` bundles are effectively fixed by
 * role (owner holds everything; viewer is read-only); `admin`/`member` are the
 * common starting points that get toggled. Used by the invite service (resolved
 * set stored on the invite) and the member-update service (re-applied when a role
 * changes), so the matrix lives in exactly one place.
 */
export function defaultPermissionsForRole(
  role: MemberRole,
): Record<Permission, boolean> {
  switch (role) {
    case "owner":
      return {
        can_view_plan: true,
        can_suggest_meals: true,
        can_change_today_menu: true,
        can_change_weekly_schedule: true,
        can_manage_grocery_list: true,
        can_invite_members: true,
        can_remove_members: true,
        can_edit_household_preferences: true,
      };
    case "admin":
      return {
        can_view_plan: true,
        can_suggest_meals: true,
        can_change_today_menu: true,
        can_change_weekly_schedule: true,
        can_manage_grocery_list: true,
        can_invite_members: true,
        can_remove_members: false,
        can_edit_household_preferences: true,
      };
    case "member":
      return {
        can_view_plan: true,
        can_suggest_meals: true,
        can_change_today_menu: false,
        can_change_weekly_schedule: false,
        can_manage_grocery_list: false,
        can_invite_members: false,
        can_remove_members: false,
        can_edit_household_preferences: false,
      };
    case "viewer":
      return {
        can_view_plan: true,
        can_suggest_meals: false,
        can_change_today_menu: false,
        can_change_weekly_schedule: false,
        can_manage_grocery_list: false,
        can_invite_members: false,
        can_remove_members: false,
        can_edit_household_preferences: false,
      };
  }
}
