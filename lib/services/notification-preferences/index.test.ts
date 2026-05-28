import { beforeEach, describe, expect, it, vi } from "vitest";

import { getActiveMembership, requireAuthUser } from "@/lib/auth";
import type { MembershipContext } from "@/lib/auth/permissions";
import { createServerSupabaseClient } from "@/lib/db/server";
import { InternalError, NotFoundError, ValidationError } from "@/lib/errors";

// index.ts is server-only and depends on the auth guard + per-request client.
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/server", () => ({ createServerSupabaseClient: vi.fn() }));
vi.mock("@/lib/auth", () => ({
  getActiveMembership: vi.fn(),
  requireAuthUser: vi.fn(),
}));

import { getMyEmailPreferences, updateMyEmailPreferences } from "./index";

const HOUSEHOLD_ID = "22222222-2222-2222-2222-222222222222";
const USER_ID = "11111111-1111-1111-1111-111111111111";

function membershipContext(): MembershipContext {
  return {
    householdId: HOUSEHOLD_ID,
    userId: USER_ID,
    role: "member",
    membershipType: "permanent",
    expiresAt: null,
    permissions: {
      can_view_plan: true,
      can_suggest_meals: true,
      can_change_today_menu: true,
      can_change_weekly_schedule: true,
      can_manage_grocery_list: false,
      can_invite_members: false,
      can_remove_members: false,
      can_edit_household_preferences: false,
    },
  };
}

type QueryResult = { data: unknown; error: unknown };

/** Stub `.from().select().eq().eq()` awaited directly (a thenable builder). */
function stubSelectListChain(result: QueryResult) {
  const builder = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    then: (resolve: (r: QueryResult) => unknown) => resolve(result),
  };
  const from = vi.fn(() => builder);
  vi.mocked(createServerSupabaseClient).mockResolvedValue({ from } as never);
  return builder;
}

/** Stub `.from().upsert()` awaited directly. */
function stubUpsertChain(result: { error: unknown }) {
  const builder = {
    upsert: vi.fn((rows: unknown, options?: unknown) => {
      void rows;
      void options;
      return Promise.resolve(result);
    }),
  };
  const from = vi.fn(() => builder);
  vi.mocked(createServerSupabaseClient).mockResolvedValue({ from } as never);
  return builder;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireAuthUser).mockResolvedValue({ id: USER_ID } as never);
  vi.mocked(getActiveMembership).mockResolvedValue(membershipContext());
});

describe("getMyEmailPreferences", () => {
  it("returns all categories off when the user has no rows yet", async () => {
    stubSelectListChain({ data: [], error: null });
    const dto = await getMyEmailPreferences(HOUSEHOLD_ID);
    expect(dto.householdId).toBe(HOUSEHOLD_ID);
    expect(dto.categories).toEqual({
      today_meal: false,
      weekly_plan: false,
      member_invited: false,
      member_removed: false,
      member_changes: false,
    });
  });

  it("merges stored rows and ignores non-settable categories", async () => {
    stubSelectListChain({
      data: [
        { event_category: "today_meal", enabled: true },
        { event_category: "member_invited", enabled: true },
        { event_category: "prep_reminders", enabled: true },
      ],
      error: null,
    });
    const dto = await getMyEmailPreferences(HOUSEHOLD_ID);
    expect(dto.categories.today_meal).toBe(true);
    expect(dto.categories.member_invited).toBe(true);
    expect(dto.categories.weekly_plan).toBe(false);
    expect(dto.categories).not.toHaveProperty("prep_reminders");
  });

  it("throws NotFoundError for a malformed id without touching auth or DB", async () => {
    await expect(getMyEmailPreferences("not-a-uuid")).rejects.toBeInstanceOf(
      NotFoundError,
    );
    expect(requireAuthUser).not.toHaveBeenCalled();
    expect(createServerSupabaseClient).not.toHaveBeenCalled();
  });

  it("throws NotFoundError when the caller is not an active member", async () => {
    vi.mocked(getActiveMembership).mockResolvedValue(null);
    await expect(getMyEmailPreferences(HOUSEHOLD_ID)).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it("wraps a read error as InternalError", async () => {
    stubSelectListChain({ data: null, error: { message: "boom" } });
    await expect(getMyEmailPreferences(HOUSEHOLD_ID)).rejects.toBeInstanceOf(
      InternalError,
    );
  });
});

describe("updateMyEmailPreferences", () => {
  it("upserts a row per settable category keyed on the composite, returning the DTO", async () => {
    const builder = stubUpsertChain({ error: null });
    const dto = await updateMyEmailPreferences(HOUSEHOLD_ID, {
      householdId: HOUSEHOLD_ID,
      categories: { today_meal: true },
    });

    expect(dto.categories.today_meal).toBe(true);
    expect(dto.categories.weekly_plan).toBe(false);
    const [rows, options] = builder.upsert.mock.calls[0]!;
    expect(options).toEqual({
      onConflict: "user_id,household_id,event_category",
    });
    expect(rows).toHaveLength(5);
    expect(rows).toContainEqual({
      user_id: USER_ID,
      household_id: HOUSEHOLD_ID,
      event_category: "today_meal",
      enabled: true,
    });
  });

  it("throws NotFoundError for a malformed id before the guard", async () => {
    await expect(
      updateMyEmailPreferences("not-a-uuid", { categories: {} }),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(getActiveMembership).not.toHaveBeenCalled();
  });

  it("throws ValidationError for a bad body before any write", async () => {
    const builder = stubUpsertChain({ error: null });
    await expect(
      updateMyEmailPreferences(HOUSEHOLD_ID, { categories: { bogus: true } }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(builder.upsert).not.toHaveBeenCalled();
  });

  it("wraps an upsert error as InternalError", async () => {
    stubUpsertChain({ error: { message: "boom" } });
    await expect(
      updateMyEmailPreferences(HOUSEHOLD_ID, { categories: {} }),
    ).rejects.toBeInstanceOf(InternalError);
  });
});
