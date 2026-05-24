import { beforeEach, describe, expect, it, vi } from "vitest";

import { ConflictError } from "@/lib/errors";

vi.mock("@/lib/services/invite", () => ({ acceptInvite: vi.fn() }));

import { acceptInvite } from "@/lib/services/invite";

import { POST } from "./route";

function postRequest(): Request {
  return new Request("http://test.local/api/invites/tok/accept", {
    method: "POST",
  });
}

function routeContext(token: string) {
  return { params: Promise.resolve({ token }) };
}

beforeEach(() => vi.clearAllMocks());

describe("POST /api/invites/{token}/accept", () => {
  it("returns 200 with the household + membership status", async () => {
    vi.mocked(acceptInvite).mockResolvedValue({
      householdId: "h1",
      membershipStatus: "active",
    });

    const res = await POST(postRequest(), routeContext("tok"));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      householdId: "h1",
      membershipStatus: "active",
    });
    expect(acceptInvite).toHaveBeenCalledWith("tok");
  });

  it("maps a service ConflictError to a 409 envelope", async () => {
    vi.mocked(acceptInvite).mockRejectedValue(
      new ConflictError("already a member", { reason: "already_member" }),
    );
    const res = await POST(postRequest(), routeContext("tok"));
    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe("CONFLICT");
  });
});
