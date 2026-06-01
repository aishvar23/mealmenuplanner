import { beforeEach, describe, expect, it, vi } from "vitest";

import { ForbiddenError } from "@/lib/errors";

// Mock the `household` service so the test exercises only the boundary wiring
// (param + body parse → service call → envelope/status).
vi.mock("@/lib/services/household", () => ({ updatePreferences: vi.fn() }));

import { updatePreferences } from "@/lib/services/household";

import { PATCH } from "./route";

const HOUSEHOLD_ID = "22222222-2222-2222-2222-222222222222";

function patchRequest(rawBody: string): Request {
  return new Request(
    `http://test.local/api/households/${HOUSEHOLD_ID}/preferences`,
    {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: rawBody,
    },
  );
}

function routeContext(householdId: string) {
  return { params: Promise.resolve({ householdId }) };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("PATCH /api/households/{householdId}/preferences", () => {
  it("returns 200 with the updated preferences and forwards id + body", async () => {
    const dto = {
      familySize: 5,
      adultsCount: 2,
      kidsCount: 3,
      dietTypes: ["vegetarian" as const],
      dietType: "vegetarian" as const,
      preferredCuisines: ["North Indian"],
      spiceLevel: "medium" as const,
      weekdayCookingTimeMinutes: 30,
      weekendCookingTimeMinutes: 60,
      mealsToPlan: ["breakfast", "lunch", "dinner"],
      varietyGapDays: 7,
      allowLeftovers: true,
      budgetPreference: "medium" as const,
    };
    vi.mocked(updatePreferences).mockResolvedValue(dto);

    const res = await PATCH(
      patchRequest('{"familySize":5}'),
      routeContext(HOUSEHOLD_ID),
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(dto);
    expect(updatePreferences).toHaveBeenCalledWith(HOUSEHOLD_ID, {
      familySize: 5,
    });
  });

  it("maps a service ForbiddenError to a 403 envelope", async () => {
    vi.mocked(updatePreferences).mockRejectedValue(new ForbiddenError());

    const res = await PATCH(
      patchRequest('{"familySize":5}'),
      routeContext(HOUSEHOLD_ID),
    );

    expect(res.status).toBe(403);
    expect((await res.json()).error.code).toBe("FORBIDDEN");
  });

  it("returns a 400 envelope for a malformed JSON body, without calling the service", async () => {
    const res = await PATCH(
      patchRequest("{not json"),
      routeContext(HOUSEHOLD_ID),
    );

    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("VALIDATION_ERROR");
    expect(updatePreferences).not.toHaveBeenCalled();
  });
});
