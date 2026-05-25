import { beforeEach, describe, expect, it, vi } from "vitest";

import { getActiveMembership, requireAuthUser } from "@/lib/auth";
import type { MembershipContext } from "@/lib/auth/permissions";
import { createServerSupabaseClient } from "@/lib/db/server";
import {
  InternalError,
  NotFoundError,
  UnauthenticatedError,
  ValidationError,
} from "@/lib/errors";

// food-preferences.ts is server-only and depends on the auth guard + the
// per-request Supabase client. Stub the `server-only` marker and the I/O deps.
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/server", () => ({ createServerSupabaseClient: vi.fn() }));
vi.mock("@/lib/auth", () => ({
  getActiveMembership: vi.fn(),
  requireAuthUser: vi.fn(),
}));

import { getMyLikedDishes, updateMyFoodPreferences } from "./food-preferences";

const HOUSEHOLD_ID = "22222222-2222-2222-2222-222222222222";
const USER_ID = "11111111-1111-1111-1111-111111111111";

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

type QueryResult = { data: unknown; error: unknown };

/** Stub `.from().select().eq().eq().maybeSingle()` (the read path). */
function stubSelectChain(result: QueryResult) {
  const builder = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    maybeSingle: vi.fn(() => Promise.resolve(result)),
  };
  const from = vi.fn(() => builder);
  vi.mocked(createServerSupabaseClient).mockResolvedValue({ from } as never);
  return builder;
}

/** Stub `.from().upsert().select().single()` (the write path). */
function stubUpsertChain(result: QueryResult) {
  const builder = {
    upsert: vi.fn(() => builder),
    select: vi.fn(() => builder),
    single: vi.fn(() => Promise.resolve(result)),
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

describe("getMyLikedDishes", () => {
  it("returns the caller's liked dishes for the household", async () => {
    const builder = stubSelectChain({
      data: { liked_dishes: ["Rajma Chawal", "Masala Dosa"] },
      error: null,
    });

    const dishes = await getMyLikedDishes(HOUSEHOLD_ID);

    expect(dishes).toEqual(["Rajma Chawal", "Masala Dosa"]);
    expect(builder.eq).toHaveBeenCalledWith("household_id", HOUSEHOLD_ID);
    expect(builder.eq).toHaveBeenCalledWith("user_id", USER_ID);
  });

  it("returns an empty list when the caller has no preferences row yet", async () => {
    stubSelectChain({ data: null, error: null });
    await expect(getMyLikedDishes(HOUSEHOLD_ID)).resolves.toEqual([]);
  });

  it("returns an empty list for a malformed id without touching auth or DB", async () => {
    await expect(getMyLikedDishes("not-a-uuid")).resolves.toEqual([]);
    expect(requireAuthUser).not.toHaveBeenCalled();
    expect(createServerSupabaseClient).not.toHaveBeenCalled();
  });

  it("wraps a read query error as InternalError", async () => {
    stubSelectChain({ data: null, error: { message: "boom" } });
    await expect(getMyLikedDishes(HOUSEHOLD_ID)).rejects.toBeInstanceOf(
      InternalError,
    );
  });
});

describe("updateMyFoodPreferences", () => {
  it("upserts the caller's row keyed on (user_id, household_id) and returns the DTO", async () => {
    const builder = stubUpsertChain({
      data: { liked_dishes: ["Rajma Chawal"] },
      error: null,
    });

    const dto = await updateMyFoodPreferences(HOUSEHOLD_ID, {
      likedDishes: ["Rajma Chawal"],
    });

    expect(dto).toEqual({ likedDishes: ["Rajma Chawal"] });
    expect(builder.upsert).toHaveBeenCalledWith(
      {
        user_id: USER_ID,
        household_id: HOUSEHOLD_ID,
        liked_dishes: ["Rajma Chawal"],
      },
      { onConflict: "user_id,household_id" },
    );
  });

  it("trims, drops blanks, and de-duplicates before writing", async () => {
    const builder = stubUpsertChain({
      data: { liked_dishes: ["Rajma Chawal", "Masala Dosa"] },
      error: null,
    });

    await updateMyFoodPreferences(HOUSEHOLD_ID, {
      likedDishes: ["  Rajma Chawal ", "Masala Dosa", "Rajma Chawal", "  "],
    });

    expect(builder.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        liked_dishes: ["Rajma Chawal", "Masala Dosa"],
      }),
      expect.anything(),
    );
  });

  it("accepts an empty list (clearing favourites)", async () => {
    const builder = stubUpsertChain({
      data: { liked_dishes: [] },
      error: null,
    });
    const dto = await updateMyFoodPreferences(HOUSEHOLD_ID, {
      likedDishes: [],
    });
    expect(dto).toEqual({ likedDishes: [] });
    expect(builder.upsert).toHaveBeenCalled();
  });

  it("throws NotFoundError for a malformed id without hitting the guard", async () => {
    await expect(
      updateMyFoodPreferences("not-a-uuid", { likedDishes: [] }),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(getActiveMembership).not.toHaveBeenCalled();
  });

  it("throws NotFoundError when the caller is not an active member", async () => {
    vi.mocked(getActiveMembership).mockResolvedValue(null);
    await expect(
      updateMyFoodPreferences(HOUSEHOLD_ID, { likedDishes: [] }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("throws ValidationError when no recognized field is present, before any write", async () => {
    const builder = stubUpsertChain({
      data: { liked_dishes: [] },
      error: null,
    });
    await expect(
      updateMyFoodPreferences(HOUSEHOLD_ID, { somethingElse: true }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(builder.upsert).not.toHaveBeenCalled();
  });

  it("throws ValidationError when likedDishes is not an array of strings", async () => {
    stubUpsertChain({ data: { liked_dishes: [] }, error: null });
    await expect(
      updateMyFoodPreferences(HOUSEHOLD_ID, { likedDishes: [1, 2] }),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(
      updateMyFoodPreferences(HOUSEHOLD_ID, { likedDishes: "Rajma" }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("wraps an upsert query error as InternalError", async () => {
    stubUpsertChain({ data: null, error: { message: "boom" } });
    await expect(
      updateMyFoodPreferences(HOUSEHOLD_ID, { likedDishes: ["Rajma Chawal"] }),
    ).rejects.toBeInstanceOf(InternalError);
  });

  it("propagates UnauthenticatedError from the guard", async () => {
    vi.mocked(requireAuthUser).mockRejectedValue(new UnauthenticatedError());
    await expect(
      updateMyFoodPreferences(HOUSEHOLD_ID, { likedDishes: [] }),
    ).rejects.toBeInstanceOf(UnauthenticatedError);
  });
});
