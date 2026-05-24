import { beforeEach, describe, expect, it, vi } from "vitest";

import { NotFoundError } from "@/lib/errors";

vi.mock("@/lib/services/invite", () => ({ declineInvite: vi.fn() }));

import { declineInvite } from "@/lib/services/invite";

import { POST } from "./route";

function postRequest(): Request {
  return new Request("http://test.local/api/invites/tok/decline", {
    method: "POST",
  });
}

function routeContext(token: string) {
  return { params: Promise.resolve({ token }) };
}

beforeEach(() => vi.clearAllMocks());

describe("POST /api/invites/{token}/decline", () => {
  it("returns 200 with the declined status", async () => {
    vi.mocked(declineInvite).mockResolvedValue({ status: "declined" });
    const res = await POST(postRequest(), routeContext("tok"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "declined" });
    expect(declineInvite).toHaveBeenCalledWith("tok");
  });

  it("maps a service NotFoundError to a 404 envelope", async () => {
    vi.mocked(declineInvite).mockRejectedValue(new NotFoundError());
    const res = await POST(postRequest(), routeContext("bad"));
    expect(res.status).toBe(404);
    expect((await res.json()).error.code).toBe("NOT_FOUND");
  });
});
