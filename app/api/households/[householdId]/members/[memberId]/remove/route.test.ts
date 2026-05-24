import { beforeEach, describe, expect, it, vi } from "vitest";

import { ConflictError } from "@/lib/errors";

vi.mock("@/lib/services/household", () => ({ removeMember: vi.fn() }));

import { removeMember } from "@/lib/services/household";

import { POST } from "./route";

const HOUSEHOLD_ID = "22222222-2222-2222-2222-222222222222";
const MEMBER_ID = "33333333-3333-3333-3333-333333333333";

function postRequest(): Request {
  return new Request(
    `http://test.local/api/households/${HOUSEHOLD_ID}/members/${MEMBER_ID}/remove`,
    { method: "POST" },
  );
}

function routeContext() {
  return {
    params: Promise.resolve({ householdId: HOUSEHOLD_ID, memberId: MEMBER_ID }),
  };
}

beforeEach(() => vi.clearAllMocks());

describe("POST /api/households/{householdId}/members/{memberId}/remove", () => {
  it("returns 200 with the removed status", async () => {
    vi.mocked(removeMember).mockResolvedValue({
      memberId: MEMBER_ID,
      status: "removed",
    });
    const res = await POST(postRequest(), routeContext());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      memberId: MEMBER_ID,
      status: "removed",
    });
    expect(removeMember).toHaveBeenCalledWith(HOUSEHOLD_ID, MEMBER_ID);
  });

  it("maps a service ConflictError (e.g. removing the owner) to 409", async () => {
    vi.mocked(removeMember).mockRejectedValue(
      new ConflictError("owner", { reason: "owner" }),
    );
    const res = await POST(postRequest(), routeContext());
    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe("CONFLICT");
  });
});
