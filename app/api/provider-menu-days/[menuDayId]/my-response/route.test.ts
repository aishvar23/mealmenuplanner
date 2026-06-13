import { beforeEach, describe, expect, it, vi } from "vitest";

import { ConflictError } from "@/lib/errors";
import type { MemberResponseDto } from "@/packages/shared/provider";

vi.mock("@/lib/services/provider", () => ({
  getMyResponse: vi.fn(),
  saveMyResponse: vi.fn(),
}));

import { getMyResponse, saveMyResponse } from "@/lib/services/provider";

import { GET, PUT } from "./route";

const MENU_DAY = "44444444-4444-4444-4444-444444444444";

const DTO: MemberResponseDto = {
  responseId: "99999999-9999-9999-9999-999999999999",
  menuDayId: MENU_DAY,
  status: "draft",
  version: 2,
  memberNote: null,
  items: [],
  lockedAt: null,
};

const context = { params: Promise.resolve({ menuDayId: MENU_DAY }) };

function putReq(body: unknown): Request {
  return new Request(
    `http://test/api/provider-menu-days/${MENU_DAY}/my-response`,
    {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/provider-menu-days/{id}/my-response", () => {
  it("returns the caller's response DTO", async () => {
    vi.mocked(getMyResponse).mockResolvedValue(DTO);
    const res = await GET(new Request("http://test"), context);
    expect(getMyResponse).toHaveBeenCalledWith(MENU_DAY);
    expect(res.status).toBe(200);
    expect((await res.json()).version).toBe(2);
  });
});

describe("PUT /api/provider-menu-days/{id}/my-response", () => {
  it("parses the JSON body, delegates the save, and returns the DTO", async () => {
    vi.mocked(saveMyResponse).mockResolvedValue(DTO);
    const body = { expectedVersion: 1, items: [], memberNote: null };
    const res = await PUT(putReq(body), context);
    expect(saveMyResponse).toHaveBeenCalledWith(MENU_DAY, body);
    expect(res.status).toBe(200);
  });

  it("maps a stale-version ConflictError to a 409 envelope with the reason", async () => {
    vi.mocked(saveMyResponse).mockRejectedValue(
      new ConflictError("Your response changed elsewhere.", {
        reason: "stale_version",
        currentVersion: 5,
      }),
    );
    const res = await PUT(putReq({ items: [] }), context);
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.error.code).toBe("CONFLICT");
    expect(json.error.details.reason).toBe("stale_version");
    expect(json.error.details.currentVersion).toBe(5);
  });

  it("rejects a non-JSON body with a 400 before the service runs", async () => {
    const bad = new Request(
      `http://test/api/provider-menu-days/${MENU_DAY}/my-response`,
      { method: "PUT", body: "{not json" },
    );
    const res = await PUT(bad, context);
    expect(res.status).toBe(400);
    expect(saveMyResponse).not.toHaveBeenCalled();
  });
});
