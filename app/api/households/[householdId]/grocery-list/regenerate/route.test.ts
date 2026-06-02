import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/services/grocery", () => ({
  regenerateGroceryList: vi.fn(),
  validateRegenerateRequest: vi.fn((b: { mealPlanId: string }) => ({
    mealPlanId: b.mealPlanId,
  })),
}));

// `withIdempotency` is server-only; its replay logic is covered in
// lib/services/idempotency. Stub it to run the generator and return the fresh
// response so the route's delegation stays under test without `server-only`.
vi.mock("@/lib/services/idempotency", () => ({
  withIdempotency: vi.fn(
    async ({
      run,
      successStatus,
    }: {
      run: () => Promise<unknown>;
      successStatus: number;
    }) => Response.json(await run(), { status: successStatus }),
  ),
}));

import { regenerateGroceryList } from "@/lib/services/grocery";

import { POST } from "./route";

const HH = "22222222-2222-2222-2222-222222222222";
const PLAN = "33333333-3333-3333-3333-333333333333";

function req(body: string): Request {
  return new Request("http://t.local", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  });
}

const ctx = { params: Promise.resolve({ householdId: HH }) };

beforeEach(() => vi.clearAllMocks());

describe("POST grocery-list/regenerate", () => {
  it("delegates to regenerateGroceryList and returns 200", async () => {
    vi.mocked(regenerateGroceryList).mockResolvedValue({
      groceryListId: "g1",
      mealPlanId: PLAN,
      status: "active",
      items: [],
    });

    const res = await POST(req(`{"mealPlanId":"${PLAN}"}`), ctx);

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ groceryListId: "g1" });
    expect(regenerateGroceryList).toHaveBeenCalledWith(HH, PLAN);
  });

  it("400s a malformed JSON body", async () => {
    const res = await POST(req("{nope"), ctx);
    expect(res.status).toBe(400);
    expect(regenerateGroceryList).not.toHaveBeenCalled();
  });
});
