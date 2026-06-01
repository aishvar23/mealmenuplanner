/**
 * `household` service DTOs — the snake_case-row → camelCase-payload translation
 * (design/04 § 1, "the translation boundary"). Pure mappers, no I/O, so the
 * service layer produces client-ready DTOs and the route handler just
 * serializes them. Shared by the household read (P1-6), the preferences update
 * (P1-7), and the member list (P1-8) so the wire shapes stay identical.
 *
 * Enum **values** pass through unchanged — they are data, not naming convention
 * (design/04 § 1).
 */

import type {
  MemberRole,
  MembershipContext,
  MembershipType,
  MemberStatus,
  Permission,
} from "@/lib/auth/permissions";
import type { Database } from "@/lib/db/database.types";

type DietType = Database["public"]["Enums"]["diet_type"];
type SpiceLevel = Database["public"]["Enums"]["spice_level"];
type BudgetPreference = Database["public"]["Enums"]["budget_preference"];

type HouseholdPreferencesRow =
  Database["public"]["Tables"]["household_preferences"]["Row"];

/** The `household_preferences` columns projected into the API DTO. */
export type PreferencesRow = Pick<
  HouseholdPreferencesRow,
  | "family_size"
  | "adults_count"
  | "kids_count"
  | "diet_type"
  | "diet_types"
  | "preferred_cuisines"
  | "spice_level"
  | "weekday_cooking_time_minutes"
  | "weekend_cooking_time_minutes"
  | "meals_to_plan"
  | "variety_gap_days"
  | "allow_leftovers"
  | "budget_preference"
>;

/** Household preferences as the API exposes them (design/04 § 4.1). */
export interface PreferencesDto {
  familySize: number;
  adultsCount: number;
  kidsCount: number;
  /** The household's diet(s); multi-select (BETA). Always non-empty. */
  dietTypes: DietType[];
  /** @deprecated Legacy single diet, kept as a mirror = `dietTypes[0]`. */
  dietType: DietType;
  preferredCuisines: string[];
  spiceLevel: SpiceLevel;
  weekdayCookingTimeMinutes: number | null;
  weekendCookingTimeMinutes: number | null;
  mealsToPlan: string[];
  varietyGapDays: number;
  allowLeftovers: boolean;
  budgetPreference: BudgetPreference;
}

/** Map a `household_preferences` row to its camelCase DTO. */
export function toPreferencesDto(row: PreferencesRow): PreferencesDto {
  // `diet_types` is authoritative; the scalar `diet_type` is a kept-in-sync
  // mirror (and a fallback for any row written before the array existed).
  const dietTypes =
    row.diet_types.length > 0
      ? row.diet_types
      : row.diet_type
        ? [row.diet_type]
        : [];
  return {
    familySize: row.family_size,
    adultsCount: row.adults_count,
    kidsCount: row.kids_count,
    dietTypes,
    dietType: dietTypes[0] ?? row.diet_type ?? "vegetarian",
    preferredCuisines: row.preferred_cuisines,
    spiceLevel: row.spice_level,
    weekdayCookingTimeMinutes: row.weekday_cooking_time_minutes,
    weekendCookingTimeMinutes: row.weekend_cooking_time_minutes,
    mealsToPlan: row.meals_to_plan,
    varietyGapDays: row.variety_gap_days,
    allowLeftovers: row.allow_leftovers,
    budgetPreference: row.budget_preference,
  };
}

/**
 * The eight `can_*` permission flags in camelCase. Shared by
 * `currentUserPermissions` (household read) and each member's `permissions`
 * (member list) so the two stay in lockstep.
 */
export interface CanFlagsDto {
  canViewPlan: boolean;
  canSuggestMeals: boolean;
  canChangeTodayMenu: boolean;
  canChangeWeeklySchedule: boolean;
  canManageGroceryList: boolean;
  canInviteMembers: boolean;
  canRemoveMembers: boolean;
  canEditHouseholdPreferences: boolean;
}

/** Map the snake_case permission map (the runtime source of truth) to camelCase. */
export function toCanFlagsDto(
  permissions: Record<Permission, boolean>,
): CanFlagsDto {
  return {
    canViewPlan: permissions.can_view_plan,
    canSuggestMeals: permissions.can_suggest_meals,
    canChangeTodayMenu: permissions.can_change_today_menu,
    canChangeWeeklySchedule: permissions.can_change_weekly_schedule,
    canManageGroceryList: permissions.can_manage_grocery_list,
    canInviteMembers: permissions.can_invite_members,
    canRemoveMembers: permissions.can_remove_members,
    canEditHouseholdPreferences: permissions.can_edit_household_preferences,
  };
}

/**
 * The caller's own role + permissions, embedded in the household read so the
 * client can hide controls it can't use (design/04 § 4.1).
 */
export interface CurrentUserPermissionsDto extends CanFlagsDto {
  role: MemberRole;
  membershipType: MembershipType;
}

/** Build `currentUserPermissions` from the guard's membership context. */
export function toCurrentUserPermissionsDto(
  context: MembershipContext,
): CurrentUserPermissionsDto {
  return {
    role: context.role,
    membershipType: context.membershipType,
    ...toCanFlagsDto(context.permissions),
  };
}

/**
 * One row returned by the `list_household_members` RPC (P1-8 migration) — the
 * safe member-list projection that joins `household_members` to a member's
 * `users.display_name` past the `users` self-only RLS, exposing only the name
 * (never email/phone). The generated types mark every column non-null, but
 * `display_name`/`expires_at` are genuinely nullable on the underlying rows, so
 * the mapper treats them as such.
 */
export type MemberRow =
  Database["public"]["Functions"]["list_household_members"]["Returns"][number];

/** One member as the API exposes them (design/04 § 4.4 `data[]` item). */
export interface MemberDto {
  memberId: string;
  userId: string;
  /** Null until the user sets a name (e.g. an email signup with no full name). */
  displayName: string | null;
  role: MemberRole;
  membershipType: MembershipType;
  status: MemberStatus;
  /** Null for permanent members; a deadline for temporary guests. */
  expiresAt: string | null;
  joinedAt: string | null;
  permissions: CanFlagsDto;
}

/** Map a `list_household_members` row to its camelCase member DTO. */
export function toMemberDto(row: MemberRow): MemberDto {
  return {
    memberId: row.member_id,
    userId: row.user_id,
    displayName: row.display_name,
    role: row.role,
    membershipType: row.membership_type,
    status: row.status,
    expiresAt: row.expires_at,
    joinedAt: row.joined_at,
    permissions: toCanFlagsDto(row),
  };
}

/** Response for `POST .../members/{memberId}/remove` (design/04 § 4.4). */
export interface RemoveMemberResult {
  memberId: string;
  status: "removed";
}

/** Response for `POST .../leave` (design/04 § 4.4). */
export interface LeaveHouseholdResult {
  householdId: string;
  status: "left";
}

/** Response payload for `GET /api/households/{householdId}` (design/04 § 4.1). */
export interface HouseholdDto {
  id: string;
  name: string;
  createdByUserId: string;
  /**
   * `null` for a household created via the raw `POST /api/households` path,
   * which has no preferences row until onboarding completion (P2-6) or the first
   * preferences update (P1-7) creates one.
   */
  preferences: PreferencesDto | null;
  currentUserPermissions: CurrentUserPermissionsDto;
}
