import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/services/meal-plan", () => ({
  rejectItem: vi.fn(),
  validateRejectRequest: vi.fn(
    (b: { feedbackType: string; reason?: string }) => ({
      feedbackType: b.feedbackType,
      reason: b.reason ?? null,
    }),
  ),
}));

import { rejectItem } from "@/lib/services/meal-plan";

import { POST } from "./route";

const ID = "33333333-3333-3333-3333-333333333333";
const ctx = { params: Promise.resolve({ mealPlanItemId: ID }) };
function req(body: string): Request {
  return new Request("http://t.local", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  });
}

beforeEach(() => vi.clearAllMocks());

describe("POST reject", () => {
  it("delegates to rejectItem and returns 200", async () => {
    vi.mocked(rejectItem).mockResolvedValue({
      mealPlanItem: {} as never,
      alternatives: [],
    });
    const res = await POST(req('{"feedbackType":"too_much_effort"}'), ctx);
    expect(res.status).toBe(200);
    expect(rejectItem).toHaveBeenCalledWith(ID, {
      feedbackType: "too_much_effort",
      reason: null,
    });
  });

  it("400s a malformed body", async () => {
    const res = await POST(req("{nope"), ctx);
    expect(res.status).toBe(400);
    expect(rejectItem).not.toHaveBeenCalled();
  });
});
