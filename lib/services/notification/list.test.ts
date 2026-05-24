import { beforeEach, describe, expect, it, vi } from "vitest";

import { requireAuthUser } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/db/server";
import { InternalError } from "@/lib/errors";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/server", () => ({ createServerSupabaseClient: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireAuthUser: vi.fn() }));

import { decodeCursor } from "./cursor";
import { listNotifications } from "./list";

const USER_ID = "11111111-1111-1111-1111-111111111111";

function row(n: number, readAt: string | null = null) {
  return {
    id: `0000000${n}-0000-0000-0000-000000000000`,
    household_id: "h",
    actor_user_id: "a",
    event_type: "meal_changed",
    title: "Dinner changed",
    message: "msg",
    read_at: readAt,
    created_at: `2026-05-24T13:0${n}:00Z`,
  };
}

/** Chainable, awaitable PostgREST builder stub resolving to `result`. */
function makeBuilder(result: unknown) {
  const builder: Record<string, unknown> = {};
  for (const m of ["select", "eq", "order", "limit", "is", "or"]) {
    builder[m] = vi.fn(() => builder);
  }
  builder.then = (
    resolve: (v: unknown) => unknown,
    reject: (e: unknown) => unknown,
  ) => Promise.resolve(result).then(resolve, reject);
  return builder;
}

function stub(listResult: unknown, countResult: unknown) {
  const listBuilder = makeBuilder(listResult);
  const countBuilder = makeBuilder(countResult);
  const from = vi
    .fn()
    .mockReturnValueOnce(listBuilder)
    .mockReturnValueOnce(countBuilder);
  vi.mocked(createServerSupabaseClient).mockResolvedValue({ from } as never);
  return { from, listBuilder, countBuilder };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireAuthUser).mockResolvedValue({ id: USER_ID } as never);
});

describe("listNotifications", () => {
  it("returns mapped items + unread count with no next page", async () => {
    stub({ data: [row(1), row(2)], error: null }, { count: 1, error: null });

    const inbox = await listNotifications({ limit: 20 });

    expect(inbox.items).toHaveLength(2);
    expect(inbox.items[0]).toMatchObject({
      eventType: "meal_changed",
      title: "Dinner changed",
      readAt: null,
    });
    expect(inbox.unreadCount).toBe(1);
    expect(inbox.nextCursor).toBeNull();
  });

  it("sets nextCursor from the last page row when there is an extra row", async () => {
    // limit 2 → fetches 3; the 3rd signals a next page and is dropped.
    stub(
      { data: [row(1), row(2), row(3)], error: null },
      { count: 3, error: null },
    );

    const inbox = await listNotifications({ limit: 2 });

    expect(inbox.items).toHaveLength(2);
    expect(inbox.nextCursor).not.toBeNull();
    expect(decodeCursor(inbox.nextCursor as string)).toEqual({
      createdAt: row(2).created_at,
      id: row(2).id,
    });
  });

  it("applies the unreadOnly filter", async () => {
    const { listBuilder } = stub(
      { data: [], error: null },
      { count: 0, error: null },
    );
    await listNotifications({ unreadOnly: true });
    expect(listBuilder.is).toHaveBeenCalledWith("read_at", null);
  });

  it("scopes the read to the caller", async () => {
    const { listBuilder } = stub(
      { data: [], error: null },
      { count: 0, error: null },
    );
    await listNotifications();
    expect(listBuilder.eq).toHaveBeenCalledWith("recipient_user_id", USER_ID);
  });

  it("wraps a query error as InternalError", async () => {
    stub({ data: null, error: { message: "boom" } }, { count: 0, error: null });
    await expect(listNotifications()).rejects.toBeInstanceOf(InternalError);
  });
});
