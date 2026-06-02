import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock the barrel, but source the real validators the route uses
// (`isCalendarDate`, `daysBetweenInclusive`, `MAX_PLAN_RANGE_DAYS`) from the pure
// `validate` submodule (no `server-only`), so the test exercises the real
// validation without pulling the server-only read modules into a node test.
vi.mock("@/lib/services/meal-plan", async () => {
  const validate = await vi.importActual<
    typeof import("@/lib/services/meal-plan/validate")
  >("@/lib/services/meal-plan/validate");
  return {
    getWeekPlan: vi.fn(),
    isCalendarDate: validate.isCalendarDate,
    daysBetweenInclusive: validate.daysBetweenInclusive,
    MAX_PLAN_RANGE_DAYS: validate.MAX_PLAN_RANGE_DAYS,
  };
});

import { getWeekPlan } from "@/lib/services/meal-plan";

import { GET } from "./route";

const HOUSEHOLD_ID = "22222222-2222-2222-2222-222222222222";

function ctx() {
  return { params: Promise.resolve({ householdId: HOUSEHOLD_ID }) };
}

function getRequest(query = ""): Request {
  return new Request(
    `http://test.local/api/households/${HOUSEHOLD_ID}/meal-plans/week${query}`,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/households/[householdId]/meal-plans/week", () => {
  it("returns the week plan for a valid range", async () => {
    const plan = {
      startDate: "2026-06-01",
      endDate: "2026-06-07",
      items: [],
    };
    vi.mocked(getWeekPlan).mockResolvedValue(plan);

    const res = await GET(
      getRequest("?startDate=2026-06-01&endDate=2026-06-07"),
      ctx(),
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(plan);
    expect(getWeekPlan).toHaveBeenCalledWith(
      HOUSEHOLD_ID,
      "2026-06-01",
      "2026-06-07",
    );
  });

  it("returns a 400 when a bound is missing or malformed", async () => {
    const res = await GET(getRequest("?startDate=2026-06-01"), ctx());

    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("VALIDATION_ERROR");
    expect(getWeekPlan).not.toHaveBeenCalled();
  });

  it("returns a 400 when endDate precedes startDate", async () => {
    const res = await GET(
      getRequest("?startDate=2026-06-07&endDate=2026-06-01"),
      ctx(),
    );

    expect(res.status).toBe(400);
    expect(getWeekPlan).not.toHaveBeenCalled();
  });

  it("returns a 400 when the range exceeds the cap", async () => {
    const res = await GET(
      getRequest("?startDate=2026-01-01&endDate=2026-12-31"),
      ctx(),
    );

    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("VALIDATION_ERROR");
    expect(getWeekPlan).not.toHaveBeenCalled();
  });
});
