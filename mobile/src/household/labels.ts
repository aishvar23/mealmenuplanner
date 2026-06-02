import type { CanFlags, MemberRole, MemberStatus, MembershipType } from "@/api";

/**
 * Display labels + short helper text for member roles, statuses, and the eight
 * `can_*` permission flags. Hand-authored to match the web's vocabulary; the
 * value sets mirror the `member_role` / `member_status` / `membership_type` DB
 * enums and the permission flags.
 */

export const ROLE_LABELS: Record<MemberRole, string> = {
  owner: "Owner",
  admin: "Admin",
  member: "Member",
  viewer: "Viewer",
};

/** Roles assignable via the member-edit UI (owner is reached via transfer). */
export const ASSIGNABLE_ROLES: readonly MemberRole[] = [
  "admin",
  "member",
  "viewer",
];

export const ROLE_HINTS: Record<MemberRole, string> = {
  owner: "Full control of the household.",
  admin: "Manage plans, groceries, members, and preferences.",
  member: "Suggest meals and change today's menu.",
  viewer: "View-only access to the plan.",
};

export const STATUS_LABELS: Record<MemberStatus, string> = {
  invited: "Invited",
  active: "Active",
  declined: "Declined",
  expired: "Expired",
  removed: "Removed",
  left: "Left",
};

export const MEMBERSHIP_TYPE_LABELS: Record<MembershipType, string> = {
  permanent: "Permanent",
  temporary_guest: "Guest",
};

/** Each permission flag's label + one-line description, in display order. */
export const PERMISSION_LABELS: Record<
  keyof CanFlags,
  { label: string; hint: string }
> = {
  canViewPlan: { label: "View plan", hint: "See the meal plan and groceries." },
  canSuggestMeals: { label: "Suggest meals", hint: "Propose dishes." },
  canChangeTodayMenu: {
    label: "Change today's menu",
    hint: "Accept, reject, swap today's meals.",
  },
  canChangeWeeklySchedule: {
    label: "Change weekly schedule",
    hint: "Generate and edit the week plan.",
  },
  canManageGroceryList: {
    label: "Manage grocery list",
    hint: "Check off and regenerate groceries.",
  },
  canInviteMembers: {
    label: "Invite members",
    hint: "Send household invites.",
  },
  canRemoveMembers: {
    label: "Manage members",
    hint: "Change roles and remove members.",
  },
  canEditHouseholdPreferences: {
    label: "Edit preferences",
    hint: "Change household setup and food preferences.",
  },
};
