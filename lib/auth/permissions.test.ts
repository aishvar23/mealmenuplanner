import { describe, expect, it } from "vitest";

import {
  hasPermission,
  isMembershipActive,
  PERMISSION_FLAGS,
  toMembershipContext,
  toPermissionMap,
  type MembershipRow,
} from "@/lib/auth/permissions";

// A fully-permissioned active permanent member, the way an owner looks at
// creation. Override fields per test.
function memberRow(overrides: Partial<MembershipRow> = {}): MembershipRow {
  return {
    role: "owner",
    membership_type: "permanent",
    status: "active",
    expires_at: null,
    can_view_plan: true,
    can_suggest_meals: true,
    can_change_today_menu: true,
    can_change_weekly_schedule: true,
    can_manage_grocery_list: true,
    can_invite_members: true,
    can_remove_members: true,
    can_edit_household_preferences: true,
    ...overrides,
  };
}

describe("PERMISSION_FLAGS", () => {
  it("is exactly the eight can_* flags from design/03 § 4", () => {
    expect([...PERMISSION_FLAGS]).toEqual([
      "can_view_plan",
      "can_suggest_meals",
      "can_change_today_menu",
      "can_change_weekly_schedule",
      "can_manage_grocery_list",
      "can_invite_members",
      "can_remove_members",
      "can_edit_household_preferences",
    ]);
  });

  it("has no duplicates", () => {
    expect(new Set(PERMISSION_FLAGS).size).toBe(PERMISSION_FLAGS.length);
  });
});

describe("isMembershipActive", () => {
  const now = new Date("2026-05-23T12:00:00Z");

  it("is true for an active permanent member (no expiry)", () => {
    expect(isMembershipActive(memberRow({ expires_at: null }), now)).toBe(true);
  });

  it("is true for an active guest whose window has not passed", () => {
    const future = new Date("2026-05-23T13:00:00Z").toISOString();
    expect(isMembershipActive(memberRow({ expires_at: future }), now)).toBe(
      true,
    );
  });

  it("is false for an active guest past expires_at (real-time expiry)", () => {
    const past = new Date("2026-05-23T11:59:59Z").toISOString();
    expect(isMembershipActive(memberRow({ expires_at: past }), now)).toBe(
      false,
    );
  });

  it("treats expires_at exactly equal to now as expired (strict >)", () => {
    expect(
      isMembershipActive(memberRow({ expires_at: now.toISOString() }), now),
    ).toBe(false);
  });

  it("is false for any non-active status", () => {
    for (const status of [
      "invited",
      "declined",
      "expired",
      "removed",
      "left",
    ] as const) {
      expect(isMembershipActive(memberRow({ status }), now)).toBe(false);
    }
  });
});

describe("toPermissionMap", () => {
  it("copies each flag straight off the row", () => {
    const row = memberRow({
      can_view_plan: true,
      can_change_today_menu: false,
      can_remove_members: false,
    });
    const map = toPermissionMap(row);
    expect(map.can_view_plan).toBe(true);
    expect(map.can_change_today_menu).toBe(false);
    expect(map.can_remove_members).toBe(false);
    // Every flag is represented.
    expect(Object.keys(map).sort()).toEqual([...PERMISSION_FLAGS].sort());
  });
});

describe("toMembershipContext", () => {
  it("maps row columns onto the context shape", () => {
    const ctx = toMembershipContext(
      "house-1",
      "user-1",
      memberRow({ role: "viewer", membership_type: "temporary_guest" }),
    );
    expect(ctx).toMatchObject({
      householdId: "house-1",
      userId: "user-1",
      role: "viewer",
      membershipType: "temporary_guest",
      expiresAt: null,
    });
    expect(ctx.permissions.can_view_plan).toBe(true);
  });
});

describe("hasPermission", () => {
  it("is true only when the flag is set", () => {
    const ctx = toMembershipContext(
      "house-1",
      "user-1",
      memberRow({ can_change_today_menu: true, can_remove_members: false }),
    );
    expect(hasPermission(ctx, "can_change_today_menu")).toBe(true);
    expect(hasPermission(ctx, "can_remove_members")).toBe(false);
  });
});
