import { beforeEach, describe, expect, it, vi } from "vitest";

import { ForbiddenError, NotFoundError } from "@/lib/errors";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/server", () => ({ createServerSupabaseClient: vi.fn() }));
vi.mock("@/lib/auth", () => ({
  getActiveMembership: vi.fn(),
  hasPermission: vi.fn(),
}));

import { getActiveMembership, hasPermission } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/db/server";
import { createSupabaseStub } from "@/lib/services/recommendation/query-stub";

import {
  regenerateGroceryList,
  regenerateGroceryListForPlan,
} from "./generate";

const HH = "22222222-2222-2222-2222-222222222222";
const PLAN = "33333333-3333-3333-3333-333333333333";

/** A stub wired for a full happy-path regeneration (reads + rpc + re-read). */
function happyStub() {
  return createSupabaseStub({
    tables: {
      meal_plans: { data: { id: PLAN }, error: null },
      household_preferences: { data: { family_size: 4 }, error: null },
      meal_plan_items: {
        data: [{ dish_id: "d1" }, { dish_id: "d1" }],
        error: null,
      },
      dish_ingredients: {
        data: [
          {
            dish_id: "d1",
            ingredient_id: "i1",
            quantity_per_serving: 100,
            unit: "g",
          },
        ],
        error: null,
      },
      ingredients: {
        data: [{ id: "i1", name: "Spinach", category: "vegetables" }],
        error: null,
      },
      grocery_lists: {
        data: { id: "list-1", meal_plan_id: PLAN, status: "active" },
        error: null,
      },
      grocery_list_items: {
        data: [
          {
            id: "gi1",
            ingredient_id: "i1",
            name: "Spinach",
            category: "vegetables",
            quantity: 800,
            unit: "g",
            checked: false,
          },
        ],
        error: null,
      },
    },
    rpcs: { replace_grocery_list: { data: "list-1", error: null } },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getActiveMembership).mockResolvedValue({} as never);
  vi.mocked(hasPermission).mockReturnValue(true);
});

describe("regenerateGroceryList (gated)", () => {
  it("404s a malformed household id before the guard", async () => {
    await expect(regenerateGroceryList("nope", PLAN)).rejects.toBeInstanceOf(
      NotFoundError,
    );
    expect(getActiveMembership).not.toHaveBeenCalled();
  });

  it("404s a non-member (existence-hiding)", async () => {
    vi.mocked(getActiveMembership).mockResolvedValue(null);
    await expect(regenerateGroceryList(HH, PLAN)).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it("403s a member lacking can_manage_grocery_list", async () => {
    vi.mocked(hasPermission).mockReturnValue(false);
    await expect(regenerateGroceryList(HH, PLAN)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });

  it("404s a plan that is not in the caller's household", async () => {
    const stub = createSupabaseStub({
      tables: { meal_plans: { data: null, error: null } },
    });
    vi.mocked(createServerSupabaseClient).mockResolvedValue(
      stub.client as never,
    );
    await expect(regenerateGroceryList(HH, PLAN)).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it("regenerates and returns the persisted list", async () => {
    const stub = happyStub();
    vi.mocked(createServerSupabaseClient).mockResolvedValue(
      stub.client as never,
    );

    const result = await regenerateGroceryList(HH, PLAN);

    expect(result.groceryListId).toBe("list-1");
    expect(result.mealPlanId).toBe(PLAN);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({ name: "Spinach", quantity: 800 });

    const rpc = stub.calls.find((c) => c.method === "rpc");
    expect(rpc?.target).toBe("replace_grocery_list");
    // family_size 4 × per-serving 100 × 2 occurrences = 800 passed to the RPC.
    const items = (rpc?.args[0] as { p_items: { quantity: number }[] }).p_items;
    expect(items[0]?.quantity).toBe(800);
  });
});

describe("regenerateGroceryListForPlan", () => {
  it("maps an RPC not-found (P0002) to NotFoundError", async () => {
    const stub = createSupabaseStub({
      tables: {
        household_preferences: { data: { family_size: 2 }, error: null },
        meal_plan_items: { data: [], error: null },
        dish_ingredients: { data: [], error: null },
        ingredients: { data: [], error: null },
      },
      rpcs: {
        replace_grocery_list: { data: null, error: { code: "P0002" } },
      },
    });
    await expect(
      regenerateGroceryListForPlan(stub.client as never, HH, PLAN),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});
