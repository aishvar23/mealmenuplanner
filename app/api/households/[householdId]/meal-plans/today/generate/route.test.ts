import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/services/meal-plan", () => ({
  generateToday: vi.fn(),
  validateTodayRequest: vi.fn((b: { date: string; mealSlot: string }) => ({
    date: b.date,
    mealSlot: b.mealSlot,
  })),
}));

// `withIdempotency` is server-only (uses the per-request Supabase client); its
// own replay logic is covered in lib/services/idempotency. Here we stub it to run
// the wrapped generator and return the fresh response, so the route's delegation
// stays under test without pulling in `server-only`.
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

import { generateToday } from "@/lib/services/meal-plan";

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

describe("POST today/generate", () => {
  it("delegates to generateToday and returns 201", async () => {
    vi.mocked(generateToday).mockResolvedValue({
      mealPlanId: "p1",
      mealPlanItem: null,
      alternatives: [],
    });

    const res = await POST(
      req('{"date":"2026-05-25","mealSlot":"dinner"}'),
      ctx,
    );

    expect(res.status).toBe(201);
    expect(generateToday).toHaveBeenCalledWith(HH, "2026-05-25", "dinner");
  });

  it("400s a malformed JSON body before delegating", async () => {
    const res = await POST(req("{not json"), ctx);
    expect(res.status).toBe(400);
    expect(generateToday).not.toHaveBeenCalled();
  });
});
