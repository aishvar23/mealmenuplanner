import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/services/notification", () => ({
  markAllNotificationsRead: vi.fn(),
}));

import { markAllNotificationsRead } from "@/lib/services/notification";

import { POST } from "./route";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/notifications/read-all", () => {
  it("returns 200 with the cleared count", async () => {
    vi.mocked(markAllNotificationsRead).mockResolvedValue({ updated: 3 });
    const res = await POST();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ updated: 3 });
  });
});
