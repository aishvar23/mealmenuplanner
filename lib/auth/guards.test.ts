import { beforeEach, describe, expect, it, vi } from "vitest";

import { createServerSupabaseClient } from "@/lib/db/server";
import {
  ForbiddenError,
  InternalError,
  UnauthenticatedError,
} from "@/lib/errors";
import type { MembershipRow } from "@/lib/auth/permissions";
import { requireAuthUser } from "@/lib/auth/session";

// `guards.ts` is server-only and pulls in the per-request Supabase client and
// session resolver. Stub the `server-only` marker (it throws when imported
// outside a Server Component) and the two I/O dependencies so we can exercise
// the guard logic in a plain Node test.
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/server", () => ({ createServerSupabaseClient: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ requireAuthUser: vi.fn() }));

import {
  getActiveMembership,
  requireActiveMember,
  requirePermission,
} from "@/lib/auth/guards";

const USER_ID = "11111111-1111-1111-1111-111111111111";
const HOUSEHOLD_ID = "22222222-2222-2222-2222-222222222222";

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

/**
 * Stub the `.from().select().eq().eq().eq().maybeSingle()` chain the guards use,
 * resolving the terminal `maybeSingle()` to the given result.
 */
function stubMembershipQuery(result: { data: unknown; error: unknown }): {
  eq: ReturnType<typeof vi.fn>;
  from: ReturnType<typeof vi.fn>;
} {
  const builder = {
    eq: vi.fn(() => builder),
    maybeSingle: vi.fn(() => Promise.resolve(result)),
  };
  const from = vi.fn(() => ({ select: vi.fn(() => builder) }));
  vi.mocked(createServerSupabaseClient).mockResolvedValue({
    from,
  } as never);
  return { eq: builder.eq, from };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireAuthUser).mockResolvedValue({ id: USER_ID } as never);
});

describe("getActiveMembership", () => {
  it("returns the membership context for an active member", async () => {
    stubMembershipQuery({ data: memberRow(), error: null });

    const ctx = await getActiveMembership(HOUSEHOLD_ID);

    expect(ctx).not.toBeNull();
    expect(ctx).toMatchObject({
      householdId: HOUSEHOLD_ID,
      userId: USER_ID,
      role: "owner",
      membershipType: "permanent",
    });
    expect(ctx?.permissions.can_edit_household_preferences).toBe(true);
  });

  it("scopes the query to the household, the caller, and active status", async () => {
    const { eq } = stubMembershipQuery({ data: memberRow(), error: null });

    await getActiveMembership(HOUSEHOLD_ID);

    expect(eq).toHaveBeenCalledWith("household_id", HOUSEHOLD_ID);
    expect(eq).toHaveBeenCalledWith("user_id", USER_ID);
    expect(eq).toHaveBeenCalledWith("status", "active");
  });

  it("returns null when the caller has no membership row", async () => {
    stubMembershipQuery({ data: null, error: null });
    expect(await getActiveMembership(HOUSEHOLD_ID)).toBeNull();
  });

  it("returns null for a guest whose window has expired (real-time)", async () => {
    const past = new Date(Date.now() - 60_000).toISOString();
    stubMembershipQuery({
      data: memberRow({ membership_type: "temporary_guest", expires_at: past }),
      error: null,
    });
    expect(await getActiveMembership(HOUSEHOLD_ID)).toBeNull();
  });

  it("propagates UnauthenticatedError when there is no session", async () => {
    vi.mocked(requireAuthUser).mockRejectedValue(new UnauthenticatedError());
    await expect(getActiveMembership(HOUSEHOLD_ID)).rejects.toBeInstanceOf(
      UnauthenticatedError,
    );
  });

  it("wraps a query error as InternalError", async () => {
    stubMembershipQuery({ data: null, error: { message: "boom" } });
    await expect(getActiveMembership(HOUSEHOLD_ID)).rejects.toBeInstanceOf(
      InternalError,
    );
  });
});

describe("requireActiveMember", () => {
  it("returns the context for an active member", async () => {
    stubMembershipQuery({ data: memberRow(), error: null });
    const ctx = await requireActiveMember(HOUSEHOLD_ID);
    expect(ctx.userId).toBe(USER_ID);
  });

  it("throws ForbiddenError when the caller is not an active member", async () => {
    stubMembershipQuery({ data: null, error: null });
    await expect(requireActiveMember(HOUSEHOLD_ID)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });
});

describe("requirePermission", () => {
  it("returns the context when the caller holds the flag", async () => {
    stubMembershipQuery({
      data: memberRow({ can_change_today_menu: true }),
      error: null,
    });
    const ctx = await requirePermission(HOUSEHOLD_ID, "can_change_today_menu");
    expect(ctx.permissions.can_change_today_menu).toBe(true);
  });

  it("throws ForbiddenError when the caller lacks the flag", async () => {
    stubMembershipQuery({
      data: memberRow({ can_change_today_menu: false }),
      error: null,
    });
    await expect(
      requirePermission(HOUSEHOLD_ID, "can_change_today_menu"),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("throws ForbiddenError when the caller is not a member at all", async () => {
    stubMembershipQuery({ data: null, error: null });
    await expect(
      requirePermission(HOUSEHOLD_ID, "can_invite_members"),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});
