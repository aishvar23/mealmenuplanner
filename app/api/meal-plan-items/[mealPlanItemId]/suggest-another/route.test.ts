import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/services/meal-plan", () => ({ suggestAnotherItem: vi.fn() }));

import { suggestAnotherItem } from "@/lib/services/meal-plan";

import { POST } from "./route";

const ID = "33333333-3333-3333-3333-333333333333";
const ctx = { params: Promise.resolve({ mealPlanItemId: ID }) };
const req = () => new Request("http://t.local", { method: "POST" });

beforeEach(() => vi.clearAllMocks());

describe("POST suggest-another", () => {
  it("delegates and returns 200", async () => {
    vi.mocked(suggestAnotherItem).mockResolvedValue({
      mealPlanId: "p1",
      mealPlanItem: null,
      alternatives: [],
    });
    const res = await POST(req(), ctx);
    expect(res.status).toBe(200);
    expect(suggestAnotherItem).toHaveBeenCalledWith(ID);
  });
});
