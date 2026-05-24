import { beforeEach, describe, expect, it, vi } from "vitest";

import { NotFoundError } from "@/lib/errors";

vi.mock("@/lib/services/notification", () => ({
  markNotificationRead: vi.fn(),
}));

import { markNotificationRead } from "@/lib/services/notification";

import { POST } from "./route";

const NOTIF_ID = "22222222-2222-2222-2222-222222222222";

function ctx(id: string) {
  return { params: Promise.resolve({ notificationId: id }) };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/notifications/{id}/read", () => {
  it("returns 200 with the id + readAt", async () => {
    const result = { id: NOTIF_ID, readAt: "2026-05-24T14:00:00Z" };
    vi.mocked(markNotificationRead).mockResolvedValue(result);

    const res = await POST(
      new Request("http://test.local", { method: "POST" }),
      ctx(NOTIF_ID),
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(result);
    expect(markNotificationRead).toHaveBeenCalledWith(NOTIF_ID);
  });

  it("maps a NotFoundError to a 404 envelope", async () => {
    vi.mocked(markNotificationRead).mockRejectedValue(new NotFoundError());
    const res = await POST(
      new Request("http://test.local", { method: "POST" }),
      ctx(NOTIF_ID),
    );
    expect(res.status).toBe(404);
    expect((await res.json()).error.code).toBe("NOT_FOUND");
  });
});
