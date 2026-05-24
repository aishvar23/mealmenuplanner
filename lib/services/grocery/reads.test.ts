import { beforeEach, describe, expect, it, vi } from "vitest";

import { NotFoundError } from "@/lib/errors";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/server", () => ({ createServerSupabaseClient: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getActiveMembership: vi.fn() }));

import { getActiveMembership } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/db/server";
import { createSupabaseStub } from "@/lib/services/recommendation/query-stub";

import { getGroceryList, resolveCurrentPlanForGrocery } from "./reads";

const HH = "22222222-2222-2222-2222-222222222222";
const PLAN = "33333333-3333-3333-3333-333333333333";

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getActiveMembership).mockResolvedValue({} as never);
});

describe("getGroceryList", () => {
  it("404s a malformed household id before the guard", async () => {
    await expect(getGroceryList("nope", PLAN)).rejects.toBeInstanceOf(
      NotFoundError,
    );
    expect(getActiveMembership).not.toHaveBeenCalled();
  });

  it("404s a non-member (existence-hiding)", async () => {
    vi.mocked(getActiveMembership).mockResolvedValue(null);
    await expect(getGroceryList(HH, PLAN)).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it("404s when the plan has no grocery list yet", async () => {
    const stub = createSupabaseStub({
      tables: { grocery_lists: { data: null, error: null } },
    });
    vi.mocked(createServerSupabaseClient).mockResolvedValue(
      stub.client as never,
    );
    await expect(getGroceryList(HH, PLAN)).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it("returns the list with category-ordered items", async () => {
    const stub = createSupabaseStub({
      tables: {
        grocery_lists: {
          data: { id: "list-1", meal_plan_id: PLAN, status: "active" },
          error: null,
        },
        grocery_list_items: {
          data: [
            {
              id: "b",
              ingredient_id: "i2",
              name: "Salt",
              category: "spices",
              quantity: 2,
              unit: "tsp",
              checked: false,
            },
            {
              id: "a",
              ingredient_id: "i1",
              name: "Spinach",
              category: "vegetables",
              quantity: 400,
              unit: "g",
              checked: true,
            },
          ],
          error: null,
        },
      },
    });
    vi.mocked(createServerSupabaseClient).mockResolvedValue(
      stub.client as never,
    );

    const list = await getGroceryList(HH, PLAN);
    // vegetables sorts before spices regardless of row order.
    expect(list.items.map((i) => i.category)).toEqual(["vegetables", "spices"]);
    expect(list.items[0]).toMatchObject({ name: "Spinach", checked: true });
  });
});

describe("resolveCurrentPlanForGrocery", () => {
  it("returns null when the household has no active plan", async () => {
    const stub = createSupabaseStub({
      tables: { meal_plans: { data: [], error: null } },
    });
    const ref = await resolveCurrentPlanForGrocery(
      stub.client as never,
      HH,
      "2026-05-25",
    );
    expect(ref).toBeNull();
  });

  it("prefers the longest-horizon plan covering today", async () => {
    const stub = createSupabaseStub({
      tables: {
        meal_plans: {
          data: [
            { id: "day", start_date: "2026-05-25", end_date: "2026-05-25" },
            { id: "week", start_date: "2026-05-24", end_date: "2026-05-30" },
          ],
          error: null,
        },
      },
    });
    const ref = await resolveCurrentPlanForGrocery(
      stub.client as never,
      HH,
      "2026-05-25",
    );
    expect(ref?.mealPlanId).toBe("week");
  });

  it("falls back to the most recent plan when none covers today", async () => {
    const stub = createSupabaseStub({
      tables: {
        meal_plans: {
          data: [
            { id: "recent", start_date: "2026-05-20", end_date: "2026-05-22" },
            { id: "older", start_date: "2026-05-10", end_date: "2026-05-12" },
          ],
          error: null,
        },
      },
    });
    const ref = await resolveCurrentPlanForGrocery(
      stub.client as never,
      HH,
      "2026-05-25",
    );
    // The query orders by start_date desc, so plans[0] = the most recent.
    expect(ref?.mealPlanId).toBe("recent");
  });
});
