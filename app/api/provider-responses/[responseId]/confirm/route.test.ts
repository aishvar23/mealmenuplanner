import { beforeEach, describe, expect, it, vi } from "vitest";

import { ConflictError } from "@/lib/errors";
import type { MemberResponseDto } from "@/packages/shared/provider";

vi.mock("@/lib/services/provider", () => ({
  confirmMyResponse: vi.fn(),
}));

import { confirmMyResponse } from "@/lib/services/provider";

import { POST } from "./route";

const RESPONSE = "55555555-5555-5555-5555-555555555555";

const DTO: MemberResponseDto = {
  responseId: RESPONSE,
  menuDayId: "44444444-4444-4444-4444-444444444444",
  status: "confirmed",
  version: 3,
  memberNote: null,
  items: [],
  lockedAt: null,
};

const context = { params: Promise.resolve({ responseId: RESPONSE }) };
const req = () =>
  new Request(`http://test/api/provider-responses/${RESPONSE}/confirm`, {
    method: "POST",
  });

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/provider-responses/{id}/confirm", () => {
  it("confirms and returns the updated DTO", async () => {
    vi.mocked(confirmMyResponse).mockResolvedValue(DTO);
    const res = await POST(req(), context);
    expect(confirmMyResponse).toHaveBeenCalledWith(RESPONSE);
    expect(res.status).toBe(200);
    expect((await res.json()).status).toBe("confirmed");
  });

  it("maps a cutoff ConflictError to a 409 envelope", async () => {
    vi.mocked(confirmMyResponse).mockRejectedValue(
      new ConflictError("Changes are closed for this menu.", {
        reason: "cutoff_passed",
      }),
    );
    const res = await POST(req(), context);
    expect(res.status).toBe(409);
    expect((await res.json()).error.details.reason).toBe("cutoff_passed");
  });
});
