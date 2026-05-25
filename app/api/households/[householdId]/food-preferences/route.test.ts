import { beforeEach, describe, expect, it, vi } from "vitest";

import { NotFoundError } from "@/lib/errors";

// Mock the `household` service so the test exercises only the boundary wiring
// (param + body parse → service call → envelope/status).
vi.mock("@/lib/services/household", () => ({
  updateMyFoodPreferences: vi.fn(),
}));

import { updateMyFoodPreferences } from "@/lib/services/household";

import { PATCH } from "./route";

const HOUSEHOLD_ID = "22222222-2222-2222-2222-222222222222";

function patchRequest(rawBody: string): Request {
  return new Request(
    `http://test.local/api/households/${HOUSEHOLD_ID}/food-preferences`,
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

describe("PATCH /api/households/{householdId}/food-preferences", () => {
  it("returns 200 with the updated food preferences and forwards id + body", async () => {
    const dto = { likedDishes: ["Rajma Chawal", "Masala Dosa"] };
    vi.mocked(updateMyFoodPreferences).mockResolvedValue(dto);

    const res = await PATCH(
      patchRequest('{"likedDishes":["Rajma Chawal","Masala Dosa"]}'),
      routeContext(HOUSEHOLD_ID),
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(dto);
    expect(updateMyFoodPreferences).toHaveBeenCalledWith(HOUSEHOLD_ID, {
      likedDishes: ["Rajma Chawal", "Masala Dosa"],
    });
  });

  it("maps a service NotFoundError to a 404 envelope", async () => {
    vi.mocked(updateMyFoodPreferences).mockRejectedValue(new NotFoundError());

    const res = await PATCH(
      patchRequest('{"likedDishes":[]}'),
      routeContext(HOUSEHOLD_ID),
    );

    expect(res.status).toBe(404);
    expect((await res.json()).error.code).toBe("NOT_FOUND");
  });

  it("returns a 400 envelope for a malformed JSON body, without calling the service", async () => {
    const res = await PATCH(
      patchRequest("{not json"),
      routeContext(HOUSEHOLD_ID),
    );

    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("VALIDATION_ERROR");
    expect(updateMyFoodPreferences).not.toHaveBeenCalled();
  });
});
