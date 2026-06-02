import { beforeEach, describe, expect, it, vi } from "vitest";

// The route delegates to the `household` service; mock it so the test exercises
// only the boundary wiring (body parse → service call → envelope/status).
vi.mock("@/lib/services/household", () => ({
  createHousehold: vi.fn(),
  listUserHouseholds: vi.fn(),
}));

import { createHousehold, listUserHouseholds } from "@/lib/services/household";

import { GET, POST } from "./route";

const HOUSEHOLD_ID = "22222222-2222-2222-2222-222222222222";

function postRequest(rawBody: string): Request {
  return new Request("http://test.local/api/households", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: rawBody,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/households", () => {
  it("creates the household and returns 201 with its id", async () => {
    vi.mocked(createHousehold).mockResolvedValue({ householdId: HOUSEHOLD_ID });

    const res = await POST(postRequest('{"name":"Suhane Household"}'));

    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ householdId: HOUSEHOLD_ID });
    expect(createHousehold).toHaveBeenCalledWith({ name: "Suhane Household" });
  });

  it("returns a 400 VALIDATION_ERROR envelope when name is missing", async () => {
    const res = await POST(postRequest("{}"));

    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("VALIDATION_ERROR");
    expect(createHousehold).not.toHaveBeenCalled();
  });

  it("returns a 400 envelope when name is not a string", async () => {
    const res = await POST(postRequest('{"name":123}'));

    expect(res.status).toBe(400);
    expect(createHousehold).not.toHaveBeenCalled();
  });

  it("returns a 400 envelope for a malformed JSON body", async () => {
    const res = await POST(postRequest("{not json"));

    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("VALIDATION_ERROR");
    expect(createHousehold).not.toHaveBeenCalled();
  });
});

describe("GET /api/households", () => {
  it("returns the caller's households in the collection envelope", async () => {
    const households = [
      {
        householdId: HOUSEHOLD_ID,
        name: "Suhane Household",
        role: "owner" as const,
        isActive: true,
        isPreferred: true,
      },
    ];
    vi.mocked(listUserHouseholds).mockResolvedValue(households);

    const res = await GET();

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      data: households,
      page: { nextCursor: null, hasMore: false },
    });
  });

  it("returns an empty collection when the caller has no households", async () => {
    vi.mocked(listUserHouseholds).mockResolvedValue([]);

    const res = await GET();

    expect(await res.json()).toEqual({
      data: [],
      page: { nextCursor: null, hasMore: false },
    });
  });
});
