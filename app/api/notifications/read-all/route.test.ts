import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/services/notification", () => ({
  markAllNotificationsRead: vi.fn(),
}));

import { markAllNotificationsRead } from "@/lib/services/notification";

import { POST } from "./route";

beforeEach(() => {
  vi.clearAllMocks();
});

const req = (url = "http://t.local/api/notifications/read-all") =>
  new Request(url, { method: "POST" });

describe("POST /api/notifications/read-all", () => {
  it("returns 200 with the cleared count (no household scope)", async () => {
    vi.mocked(markAllNotificationsRead).mockResolvedValue({ updated: 3 });
    const res = await POST(req());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ updated: 3 });
    expect(markAllNotificationsRead).toHaveBeenCalledWith(undefined);
  });

  it("scopes to a household when ?householdId= is given", async () => {
    vi.mocked(markAllNotificationsRead).mockResolvedValue({ updated: 1 });
    const res = await POST(
      req("http://t.local/api/notifications/read-all?householdId=hh-1"),
    );
    expect(res.status).toBe(200);
    expect(markAllNotificationsRead).toHaveBeenCalledWith("hh-1");
  });
});
