import { beforeEach, describe, expect, it, vi } from "vitest";

// The route delegates to the `grocery` service; mock it so the test exercises
// only the boundary wiring (params → service call → envelope).
vi.mock("@/lib/services/grocery", () => ({ getGroceryScreen: vi.fn() }));

import { getGroceryScreen } from "@/lib/services/grocery";

import { GET } from "./route";

const HOUSEHOLD_ID = "22222222-2222-2222-2222-222222222222";

function ctx() {
  return { params: Promise.resolve({ householdId: HOUSEHOLD_ID }) };
}

function getRequest(): Request {
  return new Request(
    `http://test.local/api/households/${HOUSEHOLD_ID}/grocery-list/current`,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/households/[householdId]/grocery-list/current", () => {
  it("returns the resolved plan and its list", async () => {
    const screen = {
      plan: {
        mealPlanId: "p1",
        startDate: "2026-06-01",
        endDate: "2026-06-07",
      },
      list: {
        groceryListId: "g1",
        mealPlanId: "p1",
        status: "active" as const,
        items: [],
      },
    };
    vi.mocked(getGroceryScreen).mockResolvedValue(screen);

    const res = await GET(getRequest(), ctx());

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(screen);
    expect(getGroceryScreen).toHaveBeenCalledWith(HOUSEHOLD_ID);
  });

  it("returns nulls when the household has no current plan", async () => {
    vi.mocked(getGroceryScreen).mockResolvedValue({ plan: null, list: null });

    const res = await GET(getRequest(), ctx());

    expect(await res.json()).toEqual({ plan: null, list: null });
  });
});
