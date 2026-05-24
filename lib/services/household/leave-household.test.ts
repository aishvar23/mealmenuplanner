import { beforeEach, describe, expect, it, vi } from "vitest";

import { getActiveMembership, requireAuthUser } from "@/lib/auth";
import type { MembershipContext } from "@/lib/auth/permissions";
import { createServerSupabaseClient } from "@/lib/db/server";
import { ConflictError, InternalError, NotFoundError } from "@/lib/errors";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/server", () => ({ createServerSupabaseClient: vi.fn() }));
vi.mock("@/lib/auth", () => ({
  getActiveMembership: vi.fn(),
  requireAuthUser: vi.fn(),
}));
// member_left fan-out is a best-effort side effect (P8-6) — stub it.
vi.mock("@/lib/events", () => ({
  safeEmitHouseholdEvent: vi.fn(),
  actorDisplayName: () => "Member",
}));

import { leaveHousehold } from "./leave-household";

const CALLER = "11111111-1111-1111-1111-111111111111";
const HOUSEHOLD_ID = "22222222-2222-2222-2222-222222222222";

function membershipContext(
  role: "owner" | "admin" | "member" | "viewer",
): MembershipContext {
  return {
    householdId: HOUSEHOLD_ID,
    userId: CALLER,
    role,
    membershipType: "permanent",
    expiresAt: null,
    permissions: {
      can_view_plan: true,
      can_suggest_meals: true,
      can_change_today_menu: false,
      can_change_weekly_schedule: false,
      can_manage_grocery_list: false,
      can_invite_members: false,
      can_remove_members: false,
      can_edit_household_preferences: false,
    },
  };
}

/** Stub update(...).eq().eq().eq() resolving to { error }. */
function stubUpdate(result: { error: unknown }) {
  const eqStatus = vi.fn(() => Promise.resolve(result));
  const eqUser = vi.fn(() => ({ eq: eqStatus }));
  const eqHousehold = vi.fn(() => ({ eq: eqUser }));
  const update = vi.fn(() => ({ eq: eqHousehold }));
  const from = vi.fn(() => ({ update }));
  vi.mocked(createServerSupabaseClient).mockResolvedValue({ from } as never);
  return { from, update };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getActiveMembership).mockResolvedValue(membershipContext("member"));
  vi.mocked(requireAuthUser).mockResolvedValue({
    id: CALLER,
    email: "member@test.local",
    user_metadata: {},
  } as never);
});

describe("leaveHousehold", () => {
  it("sets the caller's membership to left", async () => {
    const { update } = stubUpdate({ error: null });
    const result = await leaveHousehold(HOUSEHOLD_ID);
    expect(result).toEqual({ householdId: HOUSEHOLD_ID, status: "left" });
    expect(update).toHaveBeenCalledWith({ status: "left" });
  });

  it("404s a non-member", async () => {
    vi.mocked(getActiveMembership).mockResolvedValue(null);
    await expect(leaveHousehold(HOUSEHOLD_ID)).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it("404s a malformed id", async () => {
    await expect(leaveHousehold("bad")).rejects.toBeInstanceOf(NotFoundError);
    expect(getActiveMembership).not.toHaveBeenCalled();
  });

  it("409s an owner trying to leave (must transfer first)", async () => {
    vi.mocked(getActiveMembership).mockResolvedValue(
      membershipContext("owner"),
    );
    stubUpdate({ error: null });
    await expect(leaveHousehold(HOUSEHOLD_ID)).rejects.toBeInstanceOf(
      ConflictError,
    );
  });

  it("wraps a DB error as InternalError", async () => {
    stubUpdate({ error: { message: "boom" } });
    await expect(leaveHousehold(HOUSEHOLD_ID)).rejects.toBeInstanceOf(
      InternalError,
    );
  });
});
