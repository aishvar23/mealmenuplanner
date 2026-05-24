import { beforeEach, describe, expect, it, vi } from "vitest";

import { getActiveMembership } from "@/lib/auth";
import type { MembershipContext } from "@/lib/auth/permissions";
import { createServerSupabaseClient } from "@/lib/db/server";
import {
  InternalError,
  NotFoundError,
  UnauthenticatedError,
} from "@/lib/errors";

// list-members.ts is server-only and depends on the auth guard + the per-request
// Supabase client. Stub the `server-only` marker and the two I/O dependencies so
// the service runs in a plain Node test.
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/server", () => ({ createServerSupabaseClient: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getActiveMembership: vi.fn() }));

import { listMembers } from "@/lib/services/household";

const USER_ID = "11111111-1111-1111-1111-111111111111";
const HOUSEHOLD_ID = "22222222-2222-2222-2222-222222222222";

function membershipContext(): MembershipContext {
  return {
    householdId: HOUSEHOLD_ID,
    userId: USER_ID,
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

const OWNER_ROW = {
  member_id: "m1",
  user_id: USER_ID,
  display_name: "Aishvarya",
  role: "owner",
  membership_type: "permanent",
  status: "active",
  expires_at: null,
  joined_at: "2026-04-01T09:00:00Z",
  can_view_plan: true,
  can_suggest_meals: true,
  can_change_today_menu: true,
  can_change_weekly_schedule: true,
  can_manage_grocery_list: true,
  can_invite_members: true,
  can_remove_members: true,
  can_edit_household_preferences: true,
};

const GUEST_ROW = {
  member_id: "m2",
  user_id: "33333333-3333-3333-3333-333333333333",
  display_name: "Priya",
  role: "viewer",
  membership_type: "temporary_guest",
  status: "active",
  expires_at: "2026-05-26T00:00:00Z",
  joined_at: "2026-05-20T09:00:00Z",
  can_view_plan: true,
  can_suggest_meals: false,
  can_change_today_menu: false,
  can_change_weekly_schedule: false,
  can_manage_grocery_list: false,
  can_invite_members: false,
  can_remove_members: false,
  can_edit_household_preferences: false,
};

/** Stub `supabase.rpc("list_household_members", …)` to resolve to the result. */
function stubRpc(result: { data: unknown; error: unknown }) {
  const rpc = vi.fn(() => Promise.resolve(result));
  vi.mocked(createServerSupabaseClient).mockResolvedValue({ rpc } as never);
  return rpc;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getActiveMembership).mockResolvedValue(membershipContext());
});

describe("listMembers", () => {
  it("returns the roster as a bounded collection of member DTOs", async () => {
    stubRpc({ data: [OWNER_ROW, GUEST_ROW], error: null });

    const result = await listMembers(HOUSEHOLD_ID);

    expect(result.page).toEqual({ nextCursor: null, hasMore: false });
    expect(result.data).toHaveLength(2);
    expect(result.data[0]).toMatchObject({
      memberId: "m1",
      displayName: "Aishvarya",
      role: "owner",
      membershipType: "permanent",
      permissions: { canInviteMembers: true },
    });
    expect(result.data[1]).toMatchObject({
      memberId: "m2",
      displayName: "Priya",
      role: "viewer",
      membershipType: "temporary_guest",
      expiresAt: "2026-05-26T00:00:00Z",
      permissions: { canInviteMembers: false, canViewPlan: true },
    });
  });

  it("calls the list_household_members RPC with the household id", async () => {
    const rpc = stubRpc({ data: [OWNER_ROW], error: null });
    await listMembers(HOUSEHOLD_ID);
    expect(rpc).toHaveBeenCalledWith("list_household_members", {
      p_household_id: HOUSEHOLD_ID,
    });
  });

  it("returns an empty collection when the RPC returns null data", async () => {
    stubRpc({ data: null, error: null });
    const result = await listMembers(HOUSEHOLD_ID);
    expect(result.data).toEqual([]);
    expect(result.page.hasMore).toBe(false);
  });

  it("throws NotFoundError when the caller is not an active member", async () => {
    vi.mocked(getActiveMembership).mockResolvedValue(null);
    const rpc = stubRpc({ data: [], error: null });
    await expect(listMembers(HOUSEHOLD_ID)).rejects.toBeInstanceOf(
      NotFoundError,
    );
    expect(rpc).not.toHaveBeenCalled();
  });

  it("throws NotFoundError for a malformed id without hitting the guard", async () => {
    await expect(listMembers("not-a-uuid")).rejects.toBeInstanceOf(
      NotFoundError,
    );
    expect(getActiveMembership).not.toHaveBeenCalled();
  });

  it("wraps an RPC error as InternalError", async () => {
    stubRpc({ data: null, error: { message: "boom" } });
    await expect(listMembers(HOUSEHOLD_ID)).rejects.toBeInstanceOf(
      InternalError,
    );
  });

  it("propagates UnauthenticatedError from the guard", async () => {
    vi.mocked(getActiveMembership).mockRejectedValue(
      new UnauthenticatedError(),
    );
    await expect(listMembers(HOUSEHOLD_ID)).rejects.toBeInstanceOf(
      UnauthenticatedError,
    );
  });
});
