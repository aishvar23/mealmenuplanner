/**
 * Client-safe display labels for the household collaboration UI (P6). Pure data —
 * value sets are the generated enums, so the exhaustive `Record`s force a label
 * when a new enum value is added.
 */

import type { Database } from "@/lib/db/database.types";

type MemberRole = Database["public"]["Enums"]["member_role"];
type MemberStatus = Database["public"]["Enums"]["member_status"];
type MembershipType = Database["public"]["Enums"]["membership_type"];

const MEMBER_ROLE_LABELS: Record<MemberRole, string> = {
  owner: "Owner",
  admin: "Admin",
  member: "Member",
  viewer: "Viewer",
};

export function memberRoleLabel(value: MemberRole): string {
  return MEMBER_ROLE_LABELS[value];
}

const MEMBER_STATUS_LABELS: Record<MemberStatus, string> = {
  invited: "Invited",
  active: "Active",
  declined: "Declined",
  expired: "Expired",
  removed: "Removed",
  left: "Left",
};

export function memberStatusLabel(value: MemberStatus): string {
  return MEMBER_STATUS_LABELS[value];
}

const MEMBERSHIP_TYPE_LABELS: Record<MembershipType, string> = {
  permanent: "Member",
  temporary_guest: "Guest",
};

export function membershipTypeLabel(value: MembershipType): string {
  return MEMBERSHIP_TYPE_LABELS[value];
}

/**
 * Roles assignable via the member-management UI. `owner` is excluded — it is
 * reached only through the dedicated transfer-ownership action (design/07 § 11).
 */
export const ASSIGNABLE_ROLES = ["admin", "member", "viewer"] as const;

/** Guest-invite window presets (days from now) offered in the invite form. */
export const GUEST_DURATION_DAYS = [1, 3, 7, 14, 30] as const;
