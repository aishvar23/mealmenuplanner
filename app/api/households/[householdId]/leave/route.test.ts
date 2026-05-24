import { beforeEach, describe, expect, it, vi } from "vitest";

import { ConflictError } from "@/lib/errors";

vi.mock("@/lib/services/household", () => ({ leaveHousehold: vi.fn() }));

import { leaveHousehold } from "@/lib/services/household";

import { POST } from "./route";

const HOUSEHOLD_ID = "22222222-2222-2222-2222-222222222222";

function postRequest(): Request {
  return new Request(`http://test.local/api/households/${HOUSEHOLD_ID}/leave`, {
    method: "POST",
  });
}

function routeContext() {
  return { params: Promise.resolve({ householdId: HOUSEHOLD_ID }) };
}

beforeEach(() => vi.clearAllMocks());

describe("POST /api/households/{householdId}/leave", () => {
  it("returns 200 with the left status", async () => {
    vi.mocked(leaveHousehold).mockResolvedValue({
      householdId: HOUSEHOLD_ID,
      status: "left",
    });
    const res = await POST(postRequest(), routeContext());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      householdId: HOUSEHOLD_ID,
      status: "left",
    });
    expect(leaveHousehold).toHaveBeenCalledWith(HOUSEHOLD_ID);
  });

  it("maps a service ConflictError (owner must transfer) to 409", async () => {
    vi.mocked(leaveHousehold).mockRejectedValue(
      new ConflictError("transfer first", { reason: "owner_must_transfer" }),
    );
    const res = await POST(postRequest(), routeContext());
    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe("CONFLICT");
  });
});
