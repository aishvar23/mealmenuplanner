import { describe, expect, it } from "vitest";

import { ValidationError } from "@/lib/errors";

import { DEFAULT_INVITE_TTL_DAYS, validateCreateInvite } from "./validate";

const NOW = new Date("2026-05-24T00:00:00Z");
const DAY = 86_400_000;

describe("validateCreateInvite", () => {
  it("normalizes a minimal permanent invite with a defaulted expiry", () => {
    const result = validateCreateInvite({ email: "guest@example.com" }, NOW);
    expect(result.membershipType).toBe("permanent");
    expect(result.role).toBe("member");
    expect(result.invitedEmail).toBe("guest@example.com");
    expect(result.invitedPhone).toBeNull();
    expect(Date.parse(result.expiresAt)).toBe(
      NOW.getTime() + DEFAULT_INVITE_TTL_DAYS * DAY,
    );
    // member role defaults: can collaborate on today + weekly meals, but not
    // manage groceries, invite, remove, or edit household preferences.
    expect(result.permissions).toMatchObject({
      can_view_plan: true,
      can_suggest_meals: true,
      can_change_today_menu: true,
      can_change_weekly_schedule: true,
      can_invite_members: false,
    });
  });

  it("requires an email or phone (invite_has_target)", () => {
    expect(() => validateCreateInvite({}, NOW)).toThrow(ValidationError);
  });

  it("accepts a phone-only invite", () => {
    const result = validateCreateInvite({ phone: "+15551234567" }, NOW);
    expect(result.invitedPhone).toBe("+15551234567");
    expect(result.invitedEmail).toBeNull();
  });

  it("rejects a malformed email", () => {
    expect(() => validateCreateInvite({ email: "nope" }, NOW)).toThrow(
      ValidationError,
    );
  });

  it("requires expiresAt for a temporary guest (guest_has_expiry)", () => {
    expect(() =>
      validateCreateInvite(
        { email: "g@example.com", membershipType: "temporary_guest" },
        NOW,
      ),
    ).toThrow(ValidationError);
  });

  it("accepts a temporary guest with a future expiry and viewer defaults", () => {
    const expiresAt = new Date(NOW.getTime() + 3 * DAY).toISOString();
    const result = validateCreateInvite(
      {
        email: "g@example.com",
        membershipType: "temporary_guest",
        role: "viewer",
        expiresAt,
      },
      NOW,
    );
    expect(result.membershipType).toBe("temporary_guest");
    expect(result.role).toBe("viewer");
    expect(result.expiresAt).toBe(expiresAt);
    expect(result.permissions.can_suggest_meals).toBe(false);
    expect(result.permissions.can_view_plan).toBe(true);
  });

  it("rejects role 'owner' (ownership is only via transfer)", () => {
    expect(() =>
      validateCreateInvite({ email: "g@example.com", role: "owner" }, NOW),
    ).toThrow(ValidationError);
  });

  it("rejects an unknown role and an unknown membershipType", () => {
    expect(() =>
      validateCreateInvite({ email: "g@example.com", role: "boss" }, NOW),
    ).toThrow(ValidationError);
    expect(() =>
      validateCreateInvite(
        { email: "g@example.com", membershipType: "forever" },
        NOW,
      ),
    ).toThrow(ValidationError);
  });

  it("rejects an expiry in the past or beyond the max window", () => {
    const past = new Date(NOW.getTime() - 1000).toISOString();
    const tooFar = new Date(NOW.getTime() + 400 * DAY).toISOString();
    expect(() =>
      validateCreateInvite({ email: "g@example.com", expiresAt: past }, NOW),
    ).toThrow(ValidationError);
    expect(() =>
      validateCreateInvite({ email: "g@example.com", expiresAt: tooFar }, NOW),
    ).toThrow(ValidationError);
  });

  it("applies camelCase permission overrides on top of role defaults", () => {
    const result = validateCreateInvite(
      {
        email: "g@example.com",
        role: "member",
        permissions: { canChangeTodayMenu: true, canManageGroceryList: true },
      },
      NOW,
    );
    expect(result.permissions.can_change_today_menu).toBe(true);
    expect(result.permissions.can_manage_grocery_list).toBe(true);
    expect(result.permissions.can_view_plan).toBe(true);
  });

  it("rejects a non-boolean permission override", () => {
    expect(() =>
      validateCreateInvite(
        { email: "g@example.com", permissions: { canChangeTodayMenu: "yes" } },
        NOW,
      ),
    ).toThrow(ValidationError);
  });

  it("rejects startsAt on or after expiresAt", () => {
    const expiresAt = new Date(NOW.getTime() + 2 * DAY).toISOString();
    const startsAt = new Date(NOW.getTime() + 3 * DAY).toISOString();
    expect(() =>
      validateCreateInvite(
        {
          email: "g@example.com",
          membershipType: "temporary_guest",
          expiresAt,
          startsAt,
        },
        NOW,
      ),
    ).toThrow(ValidationError);
  });
});
