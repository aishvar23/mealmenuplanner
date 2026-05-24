import { beforeEach, describe, expect, it, vi } from "vitest";

import { ForbiddenError } from "@/lib/errors";

vi.mock("@/lib/services/invite", () => ({ createInvite: vi.fn() }));

import { createInvite } from "@/lib/services/invite";

import { POST } from "./route";

const HOUSEHOLD_ID = "22222222-2222-2222-2222-222222222222";

function postRequest(body: unknown): Request {
  return new Request(
    `http://test.local/api/households/${HOUSEHOLD_ID}/invites`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    },
  );
}

function routeContext(householdId: string) {
  return { params: Promise.resolve({ householdId }) };
}

beforeEach(() => vi.clearAllMocks());

describe("POST /api/households/{householdId}/invites", () => {
  it("returns 201 with the invite id + link from the service", async () => {
    vi.mocked(createInvite).mockResolvedValue({
      inviteId: "inv-1",
      inviteLink: "http://test.local/invite/abc",
    });

    const res = await POST(
      postRequest({ email: "g@example.com" }),
      routeContext(HOUSEHOLD_ID),
    );

    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({
      inviteId: "inv-1",
      inviteLink: "http://test.local/invite/abc",
    });
    // The service receives the household id, the body, and the resolved base URL.
    expect(createInvite).toHaveBeenCalledWith(
      HOUSEHOLD_ID,
      { email: "g@example.com" },
      expect.any(String),
    );
  });

  it("maps a service ForbiddenError to a 403 envelope", async () => {
    vi.mocked(createInvite).mockRejectedValue(new ForbiddenError());
    const res = await POST(
      postRequest({ email: "g@example.com" }),
      routeContext(HOUSEHOLD_ID),
    );
    expect(res.status).toBe(403);
    expect((await res.json()).error.code).toBe("FORBIDDEN");
  });

  it("returns a 400 envelope for a non-JSON body", async () => {
    const req = new Request(
      `http://test.local/api/households/${HOUSEHOLD_ID}/invites`,
      { method: "POST", body: "not json" },
    );
    const res = await POST(req, routeContext(HOUSEHOLD_ID));
    expect(res.status).toBe(400);
    expect(createInvite).not.toHaveBeenCalled();
  });
});
