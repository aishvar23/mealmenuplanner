import { beforeEach, describe, expect, it, vi } from "vitest";

import { InternalError, UnauthenticatedError } from "@/lib/errors";

// Mock the `workspace` service so the test exercises only the boundary wiring.
vi.mock("@/lib/services/workspace", () => ({
  listProviderSummaries: vi.fn(),
}));

import { listProviderSummaries } from "@/lib/services/workspace";

import { GET } from "./route";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/providers", () => {
  it("wraps the provider summaries in the bounded collection envelope", async () => {
    vi.mocked(listProviderSummaries).mockResolvedValue([
      {
        providerId: "prov-a",
        name: "Anna's Kitchen",
        role: "owner",
        membershipStatus: "active",
        timezone: "Asia/Kolkata",
      },
    ]);

    const res = await GET();

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      data: [
        {
          providerId: "prov-a",
          name: "Anna's Kitchen",
          role: "owner",
          membershipStatus: "active",
          timezone: "Asia/Kolkata",
        },
      ],
      page: { nextCursor: null, hasMore: false },
    });
  });

  it("returns an empty collection for a user with no provider workspaces", async () => {
    vi.mocked(listProviderSummaries).mockResolvedValue([]);
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      data: [],
      page: { nextCursor: null, hasMore: false },
    });
  });

  it("maps an auth error to a 401 envelope", async () => {
    vi.mocked(listProviderSummaries).mockRejectedValue(
      new UnauthenticatedError(),
    );
    const res = await GET();
    expect(res.status).toBe(401);
    expect((await res.json()).error.code).toBe("UNAUTHENTICATED");
  });

  it("maps an unexpected failure to a 500 envelope", async () => {
    vi.mocked(listProviderSummaries).mockRejectedValue(new InternalError());
    const res = await GET();
    expect(res.status).toBe(500);
    expect((await res.json()).error.code).toBe("INTERNAL");
  });
});
