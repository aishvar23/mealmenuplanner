import { beforeEach, describe, expect, it, vi } from "vitest";

import { ConflictError } from "@/lib/errors";

vi.mock("@/lib/services/household", () => ({ updateMember: vi.fn() }));

import { updateMember } from "@/lib/services/household";

import { PATCH } from "./route";

const HOUSEHOLD_ID = "22222222-2222-2222-2222-222222222222";
const MEMBER_ID = "33333333-3333-3333-3333-333333333333";

function patchRequest(body: unknown): Request {
  return new Request(
    `http://test.local/api/households/${HOUSEHOLD_ID}/members/${MEMBER_ID}`,
    {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    },
  );
}

function routeContext() {
  return {
    params: Promise.resolve({ householdId: HOUSEHOLD_ID, memberId: MEMBER_ID }),
  };
}

beforeEach(() => vi.clearAllMocks());

describe("PATCH /api/households/{householdId}/members/{memberId}", () => {
  it("returns 200 with the updated member", async () => {
    const member = { memberId: MEMBER_ID, role: "admin" };
    vi.mocked(updateMember).mockResolvedValue(member as never);

    const res = await PATCH(patchRequest({ role: "admin" }), routeContext());

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(member);
    expect(updateMember).toHaveBeenCalledWith(HOUSEHOLD_ID, MEMBER_ID, {
      role: "admin",
    });
  });

  it("maps a service ConflictError to a 409 envelope", async () => {
    vi.mocked(updateMember).mockRejectedValue(
      new ConflictError("owner immutable", { reason: "owner_immutable" }),
    );
    const res = await PATCH(patchRequest({ role: "member" }), routeContext());
    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe("CONFLICT");
  });
});
