import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/services/grocery", () => ({ getGroceryList: vi.fn() }));

import { getGroceryList } from "@/lib/services/grocery";

import { GET } from "./route";

const HH = "22222222-2222-2222-2222-222222222222";
const PLAN = "33333333-3333-3333-3333-333333333333";
const ctx = { params: Promise.resolve({ householdId: HH }) };

beforeEach(() => vi.clearAllMocks());

describe("GET grocery-list", () => {
  it("delegates to getGroceryList with the mealPlanId query param", async () => {
    vi.mocked(getGroceryList).mockResolvedValue({
      groceryListId: "g1",
      mealPlanId: PLAN,
      status: "active",
      items: [],
    });

    const res = await GET(
      new Request(`http://t.local/api?mealPlanId=${PLAN}`),
      ctx,
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ groceryListId: "g1" });
    expect(getGroceryList).toHaveBeenCalledWith(HH, PLAN);
  });

  it("passes an empty string when mealPlanId is absent (service 400s it)", async () => {
    vi.mocked(getGroceryList).mockRejectedValue(
      Object.assign(new Error("bad"), { code: "VALIDATION_ERROR" }),
    );
    await GET(new Request("http://t.local/api"), ctx);
    expect(getGroceryList).toHaveBeenCalledWith(HH, "");
  });
});
