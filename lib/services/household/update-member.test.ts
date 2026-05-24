import { beforeEach, describe, expect, it, vi } from "vitest";

import { getActiveMembership, hasPermission } from "@/lib/auth";
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
// Keep the real pure helpers (defaultPermissionsForRole); mock only the I/O guards.
vi.mock("@/lib/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth")>();
  return { ...actual, getActiveMembership: vi.fn(), hasPermission: vi.fn() };
});
vi.mock("./member-lookup", () => ({
  loadTargetMember: vi.fn(),
  findMemberDto: vi.fn(),
}));

import { findMemberDto, loadTargetMember } from "./member-lookup";
import { updateMember } from "./update-member";

const OWNER_USER = "11111111-1111-1111-1111-111111111111";
const HOUSEHOLD_ID = "22222222-2222-2222-2222-222222222222";
const MEMBER_ID = "33333333-3333-3333-3333-333333333333";
const TARGET_USER = "44444444-4444-4444-4444-444444444444";

function membershipContext(
  role: "owner" | "admin" = "owner",
): MembershipContext {
  return {
    householdId: HOUSEHOLD_ID,
    userId: OWNER_USER,
    role,
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

const MEMBER_DTO = { memberId: MEMBER_ID, role: "member" } as never;

/** Stub the update chain + rpc on the per-request client. */
function stubClient(opts: { updateError?: unknown; rpcError?: unknown } = {}) {
  const eqHousehold = vi.fn(() =>
    Promise.resolve({ error: opts.updateError ?? null }),
  );
  const eqId = vi.fn(() => ({ eq: eqHousehold }));
  const update = vi.fn(() => ({ eq: eqId }));
  const from = vi.fn(() => ({ update }));
  const rpc = vi.fn(() =>
    Promise.resolve({
      data: { householdId: HOUSEHOLD_ID },
      error: opts.rpcError ?? null,
    }),
  );
  vi.mocked(createServerSupabaseClient).mockResolvedValue({
    from,
    rpc,
  } as never);
  return { from, update, rpc };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getActiveMembership).mockResolvedValue(membershipContext("owner"));
  vi.mocked(hasPermission).mockReturnValue(true);
  vi.mocked(loadTargetMember).mockResolvedValue({
    id: MEMBER_ID,
    userId: TARGET_USER,
    role: "member",
    status: "active",
  });
  vi.mocked(findMemberDto).mockResolvedValue(MEMBER_DTO);
});

describe("updateMember", () => {
  it("404s a malformed id before the guard", async () => {
    await expect(
      updateMember("bad", MEMBER_ID, { role: "admin" }),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(getActiveMembership).not.toHaveBeenCalled();
  });

  it("404s a non-member", async () => {
    vi.mocked(getActiveMembership).mockResolvedValue(null);
    await expect(
      updateMember(HOUSEHOLD_ID, MEMBER_ID, { role: "admin" }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("403s a caller without can_remove_members", async () => {
    vi.mocked(hasPermission).mockReturnValue(false);
    await expect(
      updateMember(HOUSEHOLD_ID, MEMBER_ID, { role: "admin" }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("applies a role change with that role's default flags", async () => {
    const { update } = stubClient();
    await updateMember(HOUSEHOLD_ID, MEMBER_ID, { role: "admin" });
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        role: "admin",
        can_change_today_menu: true,
        can_remove_members: false, // admin default
      }),
    );
    expect(findMemberDto).toHaveBeenCalledWith(
      expect.anything(),
      HOUSEHOLD_ID,
      MEMBER_ID,
    );
  });

  it("lets an explicit flag override the role default", async () => {
    const { update } = stubClient();
    await updateMember(HOUSEHOLD_ID, MEMBER_ID, {
      role: "member",
      canChangeTodayMenu: true,
    });
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ role: "member", can_change_today_menu: true }),
    );
  });

  it("applies a flag-only override without touching role", async () => {
    const { update } = stubClient();
    await updateMember(HOUSEHOLD_ID, MEMBER_ID, { canManageGroceryList: true });
    expect(update).toHaveBeenCalledWith({ can_manage_grocery_list: true });
  });

  it("transfers ownership via the RPC when promoting to owner", async () => {
    const { rpc, update } = stubClient();
    await updateMember(HOUSEHOLD_ID, MEMBER_ID, { role: "owner" });
    expect(rpc).toHaveBeenCalledWith("transfer_ownership", {
      p_household_id: HOUSEHOLD_ID,
      p_target_member_id: MEMBER_ID,
    });
    expect(update).not.toHaveBeenCalled();
    expect(findMemberDto).toHaveBeenCalled();
  });

  it("403s a non-owner attempting to transfer ownership", async () => {
    vi.mocked(getActiveMembership).mockResolvedValue(
      membershipContext("admin"),
    );
    stubClient();
    await expect(
      updateMember(HOUSEHOLD_ID, MEMBER_ID, { role: "owner" }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("409s promoting a member who is already owner", async () => {
    vi.mocked(loadTargetMember).mockResolvedValue({
      id: MEMBER_ID,
      userId: TARGET_USER,
      role: "owner",
      status: "active",
    });
    stubClient();
    await expect(
      updateMember(HOUSEHOLD_ID, MEMBER_ID, { role: "owner" }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("409s editing the owner via a plain change (owner is immutable here)", async () => {
    vi.mocked(loadTargetMember).mockResolvedValue({
      id: MEMBER_ID,
      userId: TARGET_USER,
      role: "owner",
      status: "active",
    });
    stubClient();
    await expect(
      updateMember(HOUSEHOLD_ID, MEMBER_ID, { canChangeTodayMenu: false }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("maps transfer RPC error codes (42501 → 403, P0002 → 404, 23514 → 409)", async () => {
    stubClient({ rpcError: { code: "42501", message: "x" } });
    await expect(
      updateMember(HOUSEHOLD_ID, MEMBER_ID, { role: "owner" }),
    ).rejects.toBeInstanceOf(ForbiddenError);

    stubClient({ rpcError: { code: "P0002", message: "x" } });
    await expect(
      updateMember(HOUSEHOLD_ID, MEMBER_ID, { role: "owner" }),
    ).rejects.toBeInstanceOf(NotFoundError);

    stubClient({ rpcError: { code: "23514", message: "x" } });
    await expect(
      updateMember(HOUSEHOLD_ID, MEMBER_ID, { role: "owner" }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("wraps a plain-update DB error as InternalError", async () => {
    stubClient({ updateError: { message: "boom" } });
    await expect(
      updateMember(HOUSEHOLD_ID, MEMBER_ID, { role: "member" }),
    ).rejects.toBeInstanceOf(InternalError);
  });
});
