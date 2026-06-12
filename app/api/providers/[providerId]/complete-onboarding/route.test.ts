import { beforeEach, describe, expect, it, vi } from "vitest";

import { ConflictError, NotFoundError } from "@/lib/errors";

vi.mock("@/lib/services/provider", () => ({
  completeProviderOnboarding: vi.fn(),
}));

import { completeProviderOnboarding } from "@/lib/services/provider";

import { POST } from "./route";

const ACTIVE = {
  providerId: "prov-1",
  name: "Anna's Kitchen",
  email: null,
  phone: null,
  city: null,
  state: null,
  country: null,
  timezone: "Asia/Kolkata",
  status: "active",
  defaultCutoffLocalTime: null,
  summaryEmailRecipients: [],
};

const context = { params: Promise.resolve({ providerId: "prov-1" }) };

function req(): Request {
  return new Request("http://test/api/providers/prov-1/complete-onboarding", {
    method: "POST",
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/providers/{id}/complete-onboarding", () => {
  it("returns the activated provider DTO", async () => {
    vi.mocked(completeProviderOnboarding).mockResolvedValue(ACTIVE);
    const res = await POST(req(), context);
    expect(completeProviderOnboarding).toHaveBeenCalledWith("prov-1");
    expect(res.status).toBe(200);
    expect((await res.json()).status).toBe("active");
  });

  it("maps a ConflictError (already set up) to a 409 envelope", async () => {
    vi.mocked(completeProviderOnboarding).mockRejectedValue(
      new ConflictError("This provider has already been set up."),
    );
    const res = await POST(req(), context);
    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe("CONFLICT");
  });

  it("maps NotFound to a 404 envelope", async () => {
    vi.mocked(completeProviderOnboarding).mockRejectedValue(
      new NotFoundError(),
    );
    const res = await POST(req(), context);
    expect(res.status).toBe(404);
    expect((await res.json()).error.code).toBe("NOT_FOUND");
  });
});
