import { beforeEach, describe, expect, it, vi } from "vitest";

import { NotFoundError } from "@/lib/errors";

vi.mock("@/lib/services/invite", () => ({ getInvitePreview: vi.fn() }));

import { getInvitePreview } from "@/lib/services/invite";

import { GET } from "./route";

function getRequest(): Request {
  return new Request("http://test.local/api/invites/the-token");
}

function routeContext(token: string) {
  return { params: Promise.resolve({ token }) };
}

beforeEach(() => vi.clearAllMocks());

describe("GET /api/invites/{token}", () => {
  it("returns 200 with the preview from the service", async () => {
    const preview = {
      householdName: "Suhane Household",
      invitedBy: "Aishvarya",
      membershipType: "permanent" as const,
      role: "member" as const,
      expiresAt: "2026-06-01T00:00:00Z",
    };
    vi.mocked(getInvitePreview).mockResolvedValue(preview);

    const res = await GET(getRequest(), routeContext("the-token"));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(preview);
    expect(getInvitePreview).toHaveBeenCalledWith("the-token");
  });

  it("maps a service NotFoundError to a 404 envelope (no oracle)", async () => {
    vi.mocked(getInvitePreview).mockRejectedValue(new NotFoundError());
    const res = await GET(getRequest(), routeContext("bad"));
    expect(res.status).toBe(404);
    expect((await res.json()).error.code).toBe("NOT_FOUND");
  });
});
