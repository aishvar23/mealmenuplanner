import { beforeEach, describe, expect, it, vi } from "vitest";

import { getActiveMembership, hasPermission } from "@/lib/auth";
import type { MembershipContext } from "@/lib/auth/permissions";
import { createServerSupabaseClient } from "@/lib/db/server";
import {
  ForbiddenError,
  InternalError,
  NotFoundError,
  UnauthenticatedError,
  ValidationError,
} from "@/lib/errors";

// update-preferences.ts is server-only and depends on the auth guard + the
// per-request Supabase client. Stub the `server-only` marker and the I/O deps.
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/server", () => ({ createServerSupabaseClient: vi.fn() }));
vi.mock("@/lib/auth", () => ({
  getActiveMembership: vi.fn(),
  hasPermission: vi.fn(),
  requireAuthUser: vi.fn(),
}));
vi.mock("@/lib/services/grocery", () => ({
  regenerateExistingGroceryListsForHousehold: vi.fn(),
}));

import { updatePreferences } from "@/lib/services/household";

const HOUSEHOLD_ID = "22222222-2222-2222-2222-222222222222";

function membershipContext(): MembershipContext {
  return {
    householdId: HOUSEHOLD_ID,
    userId: "11111111-1111-1111-1111-111111111111",
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

const UPDATED_ROW = {
  family_size: 5,
  adults_count: 2,
  kids_count: 3,
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
 * Stub the `.from().update().eq().select().maybeSingle()` chain, returning the
 * given terminal result. Exposes the spies for assertions.
 */
function stubUpdateChain(result: QueryResult) {
  const builder = {
    update: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    select: vi.fn(() => builder),
    maybeSingle: vi.fn(() => Promise.resolve(result)),
  };
  const from = vi.fn(() => builder);
  vi.mocked(createServerSupabaseClient).mockResolvedValue({ from } as never);
  return builder;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getActiveMembership).mockResolvedValue(membershipContext());
  vi.mocked(hasPermission).mockReturnValue(true);
});

describe("updatePreferences", () => {
  it("updates and returns the full preferences DTO", async () => {
    const builder = stubUpdateChain({ data: UPDATED_ROW, error: null });

    const dto = await updatePreferences(HOUSEHOLD_ID, {
      familySize: 5,
      kidsCount: 3,
    });

    expect(dto.familySize).toBe(5);
    expect(dto.kidsCount).toBe(3);
    expect(dto.dietType).toBe("vegetarian");
    expect(builder.update).toHaveBeenCalledWith({
      family_size: 5,
      kids_count: 3,
    });
    expect(builder.eq).toHaveBeenCalledWith("household_id", HOUSEHOLD_ID);
  });

  it("throws NotFoundError for a malformed id without hitting the guard", async () => {
    await expect(
      updatePreferences("not-a-uuid", { familySize: 4 }),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(getActiveMembership).not.toHaveBeenCalled();
  });

  it("throws NotFoundError when the caller is not an active member", async () => {
    vi.mocked(getActiveMembership).mockResolvedValue(null);
    await expect(
      updatePreferences(HOUSEHOLD_ID, { familySize: 4 }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("throws ForbiddenError when the member lacks the edit flag", async () => {
    vi.mocked(hasPermission).mockReturnValue(false);
    await expect(
      updatePreferences(HOUSEHOLD_ID, { familySize: 4 }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("throws ValidationError for a bad field, before any write", async () => {
    const builder = stubUpdateChain({ data: UPDATED_ROW, error: null });
    await expect(
      updatePreferences(HOUSEHOLD_ID, { familySize: 0 }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(builder.update).not.toHaveBeenCalled();
  });

  it("throws NotFoundError when no preferences row exists to update", async () => {
    stubUpdateChain({ data: null, error: null });
    await expect(
      updatePreferences(HOUSEHOLD_ID, { familySize: 4 }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("wraps an update query error as InternalError", async () => {
    stubUpdateChain({ data: null, error: { message: "boom" } });
    await expect(
      updatePreferences(HOUSEHOLD_ID, { familySize: 4 }),
    ).rejects.toBeInstanceOf(InternalError);
  });

  it("propagates UnauthenticatedError from the guard", async () => {
    vi.mocked(getActiveMembership).mockRejectedValue(
      new UnauthenticatedError(),
    );
    await expect(
      updatePreferences(HOUSEHOLD_ID, { familySize: 4 }),
    ).rejects.toBeInstanceOf(UnauthenticatedError);
  });
});
