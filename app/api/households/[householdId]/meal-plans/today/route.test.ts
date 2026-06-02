import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock the barrel, but source the real `isCalendarDate` the route uses from the
// pure `validate` submodule (no `server-only`), so the test exercises the real
// validation without pulling the server-only read modules into a node test.
vi.mock("@/lib/services/meal-plan", async () => {
  const validate = await vi.importActual<
    typeof import("@/lib/services/meal-plan/validate")
  >("@/lib/services/meal-plan/validate");
  return { getDayPlan: vi.fn(), isCalendarDate: validate.isCalendarDate };
});

import { getDayPlan } from "@/lib/services/meal-plan";

import { GET } from "./route";

const HOUSEHOLD_ID = "22222222-2222-2222-2222-222222222222";

function ctx() {
  return { params: Promise.resolve({ householdId: HOUSEHOLD_ID }) };
}

function getRequest(query = ""): Request {
  return new Request(
    `http://test.local/api/households/${HOUSEHOLD_ID}/meal-plans/today${query}`,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/households/[householdId]/meal-plans/today", () => {
  it("returns the day plan for an explicit date", async () => {
    const plan = { date: "2026-06-02", items: [] };
    vi.mocked(getDayPlan).mockResolvedValue(plan);

    const res = await GET(getRequest("?date=2026-06-02"), ctx());

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(plan);
    expect(getDayPlan).toHaveBeenCalledWith(HOUSEHOLD_ID, "2026-06-02");
  });

  it("defaults to today (UTC) when no date is given", async () => {
    vi.mocked(getDayPlan).mockResolvedValue({ date: "x", items: [] });
    const today = new Date().toISOString().slice(0, 10);

    await GET(getRequest(), ctx());

    expect(getDayPlan).toHaveBeenCalledWith(HOUSEHOLD_ID, today);
  });

  it("returns a 400 VALIDATION_ERROR for a malformed date", async () => {
    const res = await GET(getRequest("?date=06-02-2026"), ctx());

    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("VALIDATION_ERROR");
    expect(getDayPlan).not.toHaveBeenCalled();
  });
});
