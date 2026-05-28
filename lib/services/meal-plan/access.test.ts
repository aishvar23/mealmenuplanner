import { beforeEach, describe, expect, it, vi } from "vitest";

import { ForbiddenError, NotFoundError } from "@/lib/errors";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/server", () => ({ createServerSupabaseClient: vi.fn() }));
vi.mock("@/lib/auth", () => ({
  getActiveMembership: vi.fn(),
  requireAuthUser: vi.fn(),
  // hasPermission is pure — reproduce its rule against the context's flag map.
  hasPermission: (
    ctx: { permissions: Record<string, boolean> },
    perm: string,
  ) => ctx.permissions[perm] === true,
}));

import { getActiveMembership } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/db/server";
import { createSupabaseStub } from "@/lib/services/recommendation/query-stub";

import { loadItemForAction, requireHouseholdPermission } from "./access";

const HOUSEHOLD_ID = "22222222-2222-2222-2222-222222222222";
const ITEM_ID = "33333333-3333-3333-3333-333333333333";

function membership(flags: Record<string, boolean>) {
  return {
    householdId: HOUSEHOLD_ID,
    userId: "user-1",
    role: "member",
    membershipType: "permanent",
    expiresAt: null,
    permissions: {
      can_view_plan: true,
      can_suggest_meals: false,
      can_change_today_menu: false,
      can_change_weekly_schedule: false,
      can_manage_grocery_list: false,
      can_invite_members: false,
      can_remove_members: false,
      can_edit_household_preferences: false,
      ...flags,
    },
  };
}

function stubItem(date: string, status = "suggested") {
  const stub = createSupabaseStub({
    tables: {
      meal_plan_items: {
        data: {
          id: ITEM_ID,
          household_id: HOUSEHOLD_ID,
          meal_plan_id: "plan-1",
          date,
          meal_slot: "dinner",
          dish_id: "dish-1",
          status,
          locked: false,
          reason: null,
          changed_by_user_id: null,
          dishes: { name: "Dish" },
        },
        error: null,
      },
    },
  });
  vi.mocked(createServerSupabaseClient).mockResolvedValue(stub.client as never);
}

beforeEach(() => vi.clearAllMocks());

describe("requireHouseholdPermission", () => {
  it("404s a malformed household id without hitting the guard", async () => {
    await expect(
      requireHouseholdPermission("nope", "can_change_today_menu", "no"),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(getActiveMembership).not.toHaveBeenCalled();
  });

  it("404s a non-member (existence-hiding)", async () => {
    vi.mocked(getActiveMembership).mockResolvedValue(null);
    await expect(
      requireHouseholdPermission(HOUSEHOLD_ID, "can_change_today_menu", "no"),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("403s a member without the flag", async () => {
    vi.mocked(getActiveMembership).mockResolvedValue(membership({}) as never);
    await expect(
      requireHouseholdPermission(HOUSEHOLD_ID, "can_change_today_menu", "no"),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("resolves for a member with the flag", async () => {
    vi.mocked(getActiveMembership).mockResolvedValue(
      membership({ can_change_today_menu: true }) as never,
    );
    await expect(
      requireHouseholdPermission(HOUSEHOLD_ID, "can_change_today_menu", "no"),
    ).resolves.toBeUndefined();
  });
});

describe("loadItemForAction — date-aware permission (design/08 § 5)", () => {
  const NOW = new Date("2026-05-25T12:00:00Z");

  it("404s a malformed item id", async () => {
    await expect(loadItemForAction("nope", NOW)).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it("404s when the row is hidden / absent", async () => {
    const stub = createSupabaseStub({
      tables: { meal_plan_items: { data: null, error: null } },
    });
    vi.mocked(createServerSupabaseClient).mockResolvedValue(
      stub.client as never,
    );
    await expect(loadItemForAction(ITEM_ID, NOW)).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it("a today cell needs can_change_today_menu", async () => {
    stubItem("2026-05-25");
    vi.mocked(getActiveMembership).mockResolvedValue(
      membership({ can_change_weekly_schedule: true }) as never,
    );
    await expect(loadItemForAction(ITEM_ID, NOW)).rejects.toBeInstanceOf(
      ForbiddenError,
    );

    vi.mocked(getActiveMembership).mockResolvedValue(
      membership({ can_change_today_menu: true }) as never,
    );
    const { item } = await loadItemForAction(ITEM_ID, NOW);
    expect(item.id).toBe(ITEM_ID);
  });

  it("lets a permitted member act on an already-accepted meal — no status guard (BUG-017 / COLLAB-002)", async () => {
    stubItem("2026-05-25", "accepted");
    vi.mocked(getActiveMembership).mockResolvedValue(
      membership({ can_change_today_menu: true }) as never,
    );
    const { item } = await loadItemForAction(ITEM_ID, NOW);
    expect(item.id).toBe(ITEM_ID);
    expect(item.status).toBe("accepted");
  });

  it("a future cell needs can_change_weekly_schedule", async () => {
    stubItem("2026-06-01");
    vi.mocked(getActiveMembership).mockResolvedValue(
      membership({ can_change_today_menu: true }) as never,
    );
    await expect(loadItemForAction(ITEM_ID, NOW)).rejects.toBeInstanceOf(
      ForbiddenError,
    );

    vi.mocked(getActiveMembership).mockResolvedValue(
      membership({ can_change_weekly_schedule: true }) as never,
    );
    const { item } = await loadItemForAction(ITEM_ID, NOW);
    expect(item.id).toBe(ITEM_ID);
  });
});
