import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/services/meal-plan", () => ({
  generateWeek: vi.fn(),
  validateWeekRequest: vi.fn((b: { startDate: string; endDate: string }) => ({
    startDate: b.startDate,
    endDate: b.endDate,
  })),
}));

import { generateWeek } from "@/lib/services/meal-plan";

import { POST } from "./route";

const HH = "22222222-2222-2222-2222-222222222222";

function req(body: string): Request {
  return new Request("http://t.local", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  });
}

const ctx = { params: Promise.resolve({ householdId: HH }) };

beforeEach(() => vi.clearAllMocks());

describe("POST week/generate", () => {
  it("delegates to generateWeek and returns 201", async () => {
    vi.mocked(generateWeek).mockResolvedValue({
      mealPlanId: "p1",
      status: "active",
      startDate: "2026-05-25",
      endDate: "2026-05-31",
      itemCount: 21,
    });

    const res = await POST(
      req('{"startDate":"2026-05-25","endDate":"2026-05-31"}'),
      ctx,
    );

    expect(res.status).toBe(201);
    expect(await res.json()).toMatchObject({ itemCount: 21 });
    expect(generateWeek).toHaveBeenCalledWith(HH, "2026-05-25", "2026-05-31");
  });

  it("400s a malformed JSON body", async () => {
    const res = await POST(req("{nope"), ctx);
    expect(res.status).toBe(400);
    expect(generateWeek).not.toHaveBeenCalled();
  });
});
