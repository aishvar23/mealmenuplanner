import { beforeEach, describe, expect, it, vi } from "vitest";

import { getActiveMembership } from "@/lib/auth";
import type { MembershipContext } from "@/lib/auth/permissions";
import { createServerSupabaseClient } from "@/lib/db/server";
import {
  InternalError,
  NotFoundError,
  UnauthenticatedError,
} from "@/lib/errors";

// get-household.ts is server-only and depends on the auth guard + the
// per-request Supabase client. Stub the `server-only` marker and the two I/O
// dependencies so the service runs in a plain Node test.
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/server", () => ({ createServerSupabaseClient: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getActiveMembership: vi.fn() }));

import { getHousehold } from "@/lib/services/household";

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

const HOUSEHOLD_ROW = {
  id: HOUSEHOLD_ID,
  name: "Suhane Household",
  created_by_user_id: USER_ID,
};

const PREFERENCES_ROW = {
  family_size: 4,
  adults_count: 2,
  kids_count: 2,
  diet_type: "vegetarian",
  preferred_cuisines: ["North Indian"],
  spice_level: "medium",
  weekday_cooking_time_minutes: 30,
  weekend_cooking_time_minutes: 60,
  meals_to_plan: ["breakfast", "lunch", "dinner"],
  variety_gap_days: 7,
  allow_leftovers: true,
  budget_preference: "medium",
};

type QueryResult = { data: unknown; error: unknown };

/**
 * Stub the `.from(table).select().eq().maybeSingle()` chain, returning a result
 * keyed by table name (defaulting to an empty result for unspecified tables).
 */
function stubSupabase(
  results: Partial<Record<"households" | "household_preferences", QueryResult>>,
): void {
  const from = vi.fn((table: string) => {
    const result: QueryResult = results[table as keyof typeof results] ?? {
      data: null,
      error: null,
    };
    const builder = {
      eq: vi.fn(() => builder),
      maybeSingle: vi.fn(() => Promise.resolve(result)),
    };
    return { select: vi.fn(() => builder) };
  });
  vi.mocked(createServerSupabaseClient).mockResolvedValue({ from } as never);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getActiveMembership).mockResolvedValue(membershipContext());
});

describe("getHousehold", () => {
  it("returns the full DTO when household + preferences exist", async () => {
    stubSupabase({
      households: { data: HOUSEHOLD_ROW, error: null },
      household_preferences: { data: PREFERENCES_ROW, error: null },
    });

    const dto = await getHousehold(HOUSEHOLD_ID);

    expect(dto.id).toBe(HOUSEHOLD_ID);
    expect(dto.name).toBe("Suhane Household");
    expect(dto.createdByUserId).toBe(USER_ID);
    expect(dto.preferences?.familySize).toBe(4);
    expect(dto.preferences?.dietType).toBe("vegetarian");
    expect(dto.currentUserPermissions).toMatchObject({
      role: "owner",
      membershipType: "permanent",
      canEditHouseholdPreferences: true,
    });
  });

  it("returns preferences = null when no preferences row exists", async () => {
    stubSupabase({
      households: { data: HOUSEHOLD_ROW, error: null },
      household_preferences: { data: null, error: null },
    });

    const dto = await getHousehold(HOUSEHOLD_ID);
    expect(dto.preferences).toBeNull();
    expect(dto.currentUserPermissions.role).toBe("owner");
  });

  it("throws NotFoundError when the caller is not an active member", async () => {
    vi.mocked(getActiveMembership).mockResolvedValue(null);
    await expect(getHousehold(HOUSEHOLD_ID)).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it("throws NotFoundError for a malformed id without hitting the guard", async () => {
    await expect(getHousehold("not-a-uuid")).rejects.toBeInstanceOf(
      NotFoundError,
    );
    expect(getActiveMembership).not.toHaveBeenCalled();
  });

  it("throws NotFoundError when the household row is absent", async () => {
    stubSupabase({ households: { data: null, error: null } });
    await expect(getHousehold(HOUSEHOLD_ID)).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it("wraps a household query error as InternalError", async () => {
    stubSupabase({ households: { data: null, error: { message: "boom" } } });
    await expect(getHousehold(HOUSEHOLD_ID)).rejects.toBeInstanceOf(
      InternalError,
    );
  });

  it("wraps a preferences query error as InternalError", async () => {
    stubSupabase({
      households: { data: HOUSEHOLD_ROW, error: null },
      household_preferences: { data: null, error: { message: "boom" } },
    });
    await expect(getHousehold(HOUSEHOLD_ID)).rejects.toBeInstanceOf(
      InternalError,
    );
  });

  it("propagates UnauthenticatedError from the guard", async () => {
    vi.mocked(getActiveMembership).mockRejectedValue(
      new UnauthenticatedError(),
    );
    await expect(getHousehold(HOUSEHOLD_ID)).rejects.toBeInstanceOf(
      UnauthenticatedError,
    );
  });
});
