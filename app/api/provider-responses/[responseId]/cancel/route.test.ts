import { beforeEach, describe, expect, it, vi } from "vitest";

import type { MemberResponseDto } from "@/packages/shared/provider";

vi.mock("@/lib/services/provider", () => ({
  cancelMyResponse: vi.fn(),
}));

import { cancelMyResponse } from "@/lib/services/provider";

import { POST } from "./route";

const RESPONSE = "55555555-5555-5555-5555-555555555555";

const DTO: MemberResponseDto = {
  responseId: RESPONSE,
  menuDayId: "44444444-4444-4444-4444-444444444444",
  status: "cancelled",
  version: 4,
  memberNote: null,
  items: [],
  lockedAt: null,
};

const context = { params: Promise.resolve({ responseId: RESPONSE }) };
const req = () =>
  new Request(`http://test/api/provider-responses/${RESPONSE}/cancel`, {
    method: "POST",
  });

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/provider-responses/{id}/cancel", () => {
  it("cancels and returns the updated DTO", async () => {
    vi.mocked(cancelMyResponse).mockResolvedValue(DTO);
    const res = await POST(req(), context);
    expect(cancelMyResponse).toHaveBeenCalledWith(RESPONSE);
    expect(res.status).toBe(200);
    expect((await res.json()).status).toBe("cancelled");
  });
});
