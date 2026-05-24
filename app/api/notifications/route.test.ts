import { beforeEach, describe, expect, it, vi } from "vitest";

import { UnauthenticatedError } from "@/lib/errors";

vi.mock("@/lib/services/notification", () => ({ listNotifications: vi.fn() }));

import { listNotifications } from "@/lib/services/notification";

import { GET } from "./route";

beforeEach(() => {
  vi.clearAllMocks();
});

const INBOX = {
  items: [
    {
      id: "n1",
      householdId: "h",
      actorUserId: "a",
      eventType: "meal_changed",
      title: "Dinner changed",
      message: "msg",
      readAt: null,
      createdAt: "2026-05-24T13:05:00Z",
    },
  ],
  unreadCount: 1,
  nextCursor: null,
};

describe("GET /api/notifications", () => {
  it("returns 200 with the inbox and parses query params", async () => {
    vi.mocked(listNotifications).mockResolvedValue(INBOX);

    const res = await GET(
      new Request(
        "http://test.local/api/notifications?unreadOnly=true&limit=5&cursor=abc",
      ),
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(INBOX);
    expect(listNotifications).toHaveBeenCalledWith({
      unreadOnly: true,
      cursor: "abc",
      limit: 5,
    });
  });

  it("defaults limit/cursor when absent", async () => {
    vi.mocked(listNotifications).mockResolvedValue(INBOX);
    await GET(new Request("http://test.local/api/notifications"));
    expect(listNotifications).toHaveBeenCalledWith({
      unreadOnly: false,
      cursor: null,
      limit: undefined,
    });
  });

  it("maps an Unauthenticated error to a 401 envelope", async () => {
    vi.mocked(listNotifications).mockRejectedValue(new UnauthenticatedError());
    const res = await GET(new Request("http://test.local/api/notifications"));
    expect(res.status).toBe(401);
    expect((await res.json()).error.code).toBe("UNAUTHENTICATED");
  });
});
