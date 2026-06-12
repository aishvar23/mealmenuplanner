import { beforeEach, describe, expect, it, vi } from "vitest";

import { NotFoundError, ValidationError } from "@/lib/errors";

vi.mock("@/lib/services/provider", () => ({
  getProvider: vi.fn(),
  updateProvider: vi.fn(),
}));

import { getProvider, updateProvider } from "@/lib/services/provider";

import { GET, PATCH } from "./route";

const DTO = {
  providerId: "prov-1",
  name: "Anna's Kitchen",
  email: null,
  phone: null,
  city: null,
  state: null,
  country: null,
  timezone: "Asia/Kolkata",
  status: "draft",
  defaultCutoffLocalTime: null,
  summaryEmailRecipients: [],
};

const context = { params: Promise.resolve({ providerId: "prov-1" }) };

function patchRequest(body: unknown): Request {
  return new Request("http://test/api/providers/prov-1", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/providers/{id}", () => {
  it("returns the provider DTO", async () => {
    vi.mocked(getProvider).mockResolvedValue(DTO);
    const res = await GET(new Request("http://test/api/providers/prov-1"), {
      params: Promise.resolve({ providerId: "prov-1" }),
    });
    expect(getProvider).toHaveBeenCalledWith("prov-1");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(DTO);
  });

  it("maps NotFound to a 404 envelope", async () => {
    vi.mocked(getProvider).mockRejectedValue(new NotFoundError());
    const res = await GET(new Request("http://test/api/providers/prov-x"), {
      params: Promise.resolve({ providerId: "prov-x" }),
    });
    expect(res.status).toBe(404);
    expect((await res.json()).error.code).toBe("NOT_FOUND");
  });
});

describe("PATCH /api/providers/{id}", () => {
  it("passes the body to updateProvider and returns the DTO", async () => {
    const updated = { ...DTO, timezone: "America/New_York" };
    vi.mocked(updateProvider).mockResolvedValue(updated);

    const res = await PATCH(patchRequest({ timezone: "America/New_York" }), {
      params: Promise.resolve({ providerId: "prov-1" }),
    });

    expect(updateProvider).toHaveBeenCalledWith("prov-1", {
      timezone: "America/New_York",
    });
    expect(res.status).toBe(200);
    expect((await res.json()).timezone).toBe("America/New_York");
  });

  it("maps a validation failure to a 400 envelope", async () => {
    vi.mocked(updateProvider).mockRejectedValue(
      new ValidationError("bad", [{ field: "timezone", rule: "timezone" }]),
    );
    const res = await PATCH(patchRequest({ timezone: "bad" }), context);
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("VALIDATION_ERROR");
  });
});
