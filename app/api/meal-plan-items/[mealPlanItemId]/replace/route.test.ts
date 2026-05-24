import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/services/meal-plan", () => ({
  replaceItem: vi.fn(),
  validateReplaceRequest: vi.fn(
    (b: { replacementDishId?: string; reason?: string }) => ({
      replacementDishId: b.replacementDishId ?? null,
      reason: b.reason ?? null,
      feedbackType: null,
    }),
  ),
}));

import { replaceItem } from "@/lib/services/meal-plan";

import { POST } from "./route";

const ID = "33333333-3333-3333-3333-333333333333";
const DISH = "11111111-1111-1111-1111-111111111111";
const ctx = { params: Promise.resolve({ mealPlanItemId: ID }) };
function req(body: string): Request {
  return new Request("http://t.local", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  });
}

beforeEach(() => vi.clearAllMocks());

describe("POST replace", () => {
  it("delegates to replaceItem and returns 200", async () => {
    vi.mocked(replaceItem).mockResolvedValue({
      mealPlanItem: {} as never,
      groceryListUpdated: true,
    });
    const res = await POST(req(`{"replacementDishId":"${DISH}"}`), ctx);
    expect(res.status).toBe(200);
    expect(replaceItem).toHaveBeenCalledWith(ID, {
      replacementDishId: DISH,
      reason: null,
      feedbackType: null,
    });
  });

  it("400s a malformed body", async () => {
    const res = await POST(req("{nope"), ctx);
    expect(res.status).toBe(400);
    expect(replaceItem).not.toHaveBeenCalled();
  });
});
