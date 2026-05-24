import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  getActiveMembership,
  hasPermission,
  requireAuthUser,
} from "@/lib/auth";
import type { MembershipContext } from "@/lib/auth/permissions";
import { createServerSupabaseClient } from "@/lib/db/server";
import {
  ConflictError,
  ForbiddenError,
  InternalError,
  NotFoundError,
} from "@/lib/errors";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/server", () => ({ createServerSupabaseClient: vi.fn() }));
vi.mock("@/lib/auth", () => ({
  getActiveMembership: vi.fn(),
  hasPermission: vi.fn(),
  requireAuthUser: vi.fn(),
}));
vi.mock("./member-lookup", () => ({
  loadTargetMember: vi.fn(),
  findMemberDto: vi.fn(),
}));
// member_removed fan-out is a best-effort side effect (P8-6) — stub it.
vi.mock("@/lib/events", () => ({
  safeEmitHouseholdEvent: vi.fn(),
  actorDisplayName: () => "Owner",
}));

import { findMemberDto, loadTargetMember } from "./member-lookup";
import { removeMember } from "./remove-member";

const CALLER = "11111111-1111-1111-1111-111111111111";
const HOUSEHOLD_ID = "22222222-2222-2222-2222-222222222222";
const MEMBER_ID = "33333333-3333-3333-3333-333333333333";
const TARGET_USER = "44444444-4444-4444-4444-444444444444";

function membershipContext(): MembershipContext {
  return {
    householdId: HOUSEHOLD_ID,
    userId: CALLER,
    role: "owner",
    membershipType: "permanent",
    expiresAt: null,
    permissions: {
      can_view_plan: true,
      can_suggest_meals: true,
      can_change_today_menu: true,
      can_change_weekly_schedule: true,
      can_manage_grocery_list: true,
      can_invite_members: true,
      can_remove_members: true,
      can_edit_household_preferences: true,
    },
  };
}

function stubUpdate(result: { error: unknown }) {
  const eqHousehold = vi.fn(() => Promise.resolve(result));
  const eqId = vi.fn(() => ({ eq: eqHousehold }));
  const update = vi.fn(() => ({ eq: eqId }));
  const from = vi.fn(() => ({ update }));
  vi.mocked(createServerSupabaseClient).mockResolvedValue({ from } as never);
  return { from, update };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getActiveMembership).mockResolvedValue(membershipContext());
  vi.mocked(hasPermission).mockReturnValue(true);
  vi.mocked(loadTargetMember).mockResolvedValue({
    id: MEMBER_ID,
    userId: TARGET_USER,
    role: "member",
    status: "active",
  });
  vi.mocked(requireAuthUser).mockResolvedValue({
    id: CALLER,
    email: "owner@test.local",
    user_metadata: {},
  } as never);
  vi.mocked(findMemberDto).mockResolvedValue({
    memberId: MEMBER_ID,
    userId: TARGET_USER,
    displayName: "Dee",
  } as never);
});

describe("removeMember", () => {
  it("soft-removes an active non-owner member", async () => {
    const { update } = stubUpdate({ error: null });
    const result = await removeMember(HOUSEHOLD_ID, MEMBER_ID);
    expect(result).toEqual({ memberId: MEMBER_ID, status: "removed" });
    expect(update).toHaveBeenCalledWith({ status: "removed" });
  });

  it("403s a caller without can_remove_members", async () => {
    vi.mocked(hasPermission).mockReturnValue(false);
    await expect(removeMember(HOUSEHOLD_ID, MEMBER_ID)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });

  it("404s a non-member caller", async () => {
    vi.mocked(getActiveMembership).mockResolvedValue(null);
    await expect(removeMember(HOUSEHOLD_ID, MEMBER_ID)).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it("409s removing the owner", async () => {
    vi.mocked(loadTargetMember).mockResolvedValue({
      id: MEMBER_ID,
      userId: TARGET_USER,
      role: "owner",
      status: "active",
    });
    stubUpdate({ error: null });
    await expect(removeMember(HOUSEHOLD_ID, MEMBER_ID)).rejects.toBeInstanceOf(
      ConflictError,
    );
  });

  it("409s removing yourself (use leave instead)", async () => {
    vi.mocked(loadTargetMember).mockResolvedValue({
      id: MEMBER_ID,
      userId: CALLER,
      role: "member",
      status: "active",
    });
    stubUpdate({ error: null });
    await expect(removeMember(HOUSEHOLD_ID, MEMBER_ID)).rejects.toBeInstanceOf(
      ConflictError,
    );
  });

  it("wraps a DB error as InternalError", async () => {
    stubUpdate({ error: { message: "boom" } });
    await expect(removeMember(HOUSEHOLD_ID, MEMBER_ID)).rejects.toBeInstanceOf(
      InternalError,
    );
  });
});
