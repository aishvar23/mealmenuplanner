import { beforeEach, describe, expect, it, vi } from "vitest";

import { ValidationError } from "@/lib/errors";

vi.mock("@/lib/services/notification", () => ({
  registerDeviceToken: vi.fn(),
}));

import { registerDeviceToken } from "@/lib/services/notification";

import { POST } from "./route";

function postRequest(body: unknown): Request {
  return new Request("http://test.local/api/notifications/device-tokens", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => vi.clearAllMocks());

describe("POST /api/notifications/device-tokens", () => {
  it("returns 201 with the device-token id and forwards the body", async () => {
    vi.mocked(registerDeviceToken).mockResolvedValue({
      deviceTokenId: "dt-1",
    });

    const res = await POST(
      postRequest({ token: "ExponentPushToken[abc]", platform: "ios" }),
    );

    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ deviceTokenId: "dt-1" });
    expect(registerDeviceToken).toHaveBeenCalledWith({
      token: "ExponentPushToken[abc]",
      platform: "ios",
    });
  });

  it("maps a service ValidationError to a 400 envelope", async () => {
    vi.mocked(registerDeviceToken).mockRejectedValue(
      new ValidationError("A valid platform is required.", [
        { field: "platform", rule: "enum" },
      ]),
    );

    const res = await POST(postRequest({ token: "x", platform: "windows" }));

    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("VALIDATION_ERROR");
  });

  it("returns a 400 envelope for a non-JSON body without calling the service", async () => {
    const req = new Request(
      "http://test.local/api/notifications/device-tokens",
      { method: "POST", body: "not json" },
    );
    const res = await POST(req);

    expect(res.status).toBe(400);
    expect(registerDeviceToken).not.toHaveBeenCalled();
  });
});
