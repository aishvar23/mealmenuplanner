import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  InternalError,
  UnauthenticatedError,
  ValidationError,
} from "@/lib/errors";

// Mock the services so the test exercises only the boundary wiring.
vi.mock("@/lib/services/workspace", () => ({
  listProviderSummaries: vi.fn(),
}));
vi.mock("@/lib/services/provider", () => ({
  createProviderDraft: vi.fn(),
}));

import { createProviderDraft } from "@/lib/services/provider";
import { listProviderSummaries } from "@/lib/services/workspace";

import { GET, POST } from "./route";

function jsonRequest(body: unknown): Request {
  return new Request("http://test/api/providers", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

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

describe("POST /api/providers", () => {
  const DTO = {
    providerId: "prov-1",
    name: "Anna's Kitchen",
    email: null,
    phone: null,
    city: null,
    state: null,
    country: null,
    timezone: "UTC",
    status: "draft",
    defaultCutoffLocalTime: null,
    summaryEmailRecipients: [],
  };

  it("creates the draft and returns 201 with the ProviderDto", async () => {
    vi.mocked(createProviderDraft).mockResolvedValue(DTO);

    const res = await POST(jsonRequest({ name: "Anna's Kitchen" }));

    expect(createProviderDraft).toHaveBeenCalledWith("Anna's Kitchen");
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual(DTO);
  });

  it("maps a validation failure to a 400 envelope", async () => {
    vi.mocked(createProviderDraft).mockRejectedValue(
      new ValidationError("Provider name is required.", [
        { field: "name", rule: "required" },
      ]),
    );
    const res = await POST(jsonRequest({ name: "" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("VALIDATION_ERROR");
  });

  it("rejects a non-JSON body with a 400", async () => {
    const bad = new Request("http://test/api/providers", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "not json",
    });
    const res = await POST(bad);
    expect(res.status).toBe(400);
    expect(createProviderDraft).not.toHaveBeenCalled();
  });
});
