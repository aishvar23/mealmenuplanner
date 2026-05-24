import { beforeEach, describe, expect, it, vi } from "vitest";

import { requireAuthUser } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/db/server";
import { NotFoundError } from "@/lib/errors";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/server", () => ({ createServerSupabaseClient: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireAuthUser: vi.fn() }));

import { markAllNotificationsRead, markNotificationRead } from "./mark-read";

const USER_ID = "11111111-1111-1111-1111-111111111111";
const NOTIF_ID = "22222222-2222-2222-2222-222222222222";

/** Builder whose `maybeSingle()` resolves to `result` and that is awaitable. */
function makeBuilder(result: unknown) {
  const builder: Record<string, unknown> = {};
  for (const m of ["update", "select", "eq", "is"]) {
    builder[m] = vi.fn(() => builder);
  }
  builder.maybeSingle = vi.fn(() => Promise.resolve(result));
  builder.then = (
    resolve: (v: unknown) => unknown,
    reject: (e: unknown) => unknown,
  ) => Promise.resolve(result).then(resolve, reject);
  return builder;
}

function stubFrom(...builders: ReturnType<typeof makeBuilder>[]) {
  const from = vi.fn();
  for (const b of builders) from.mockReturnValueOnce(b);
  vi.mocked(createServerSupabaseClient).mockResolvedValue({ from } as never);
  return from;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireAuthUser).mockResolvedValue({ id: USER_ID } as never);
});

describe("markNotificationRead", () => {
  it("marks an unread notification read and returns the readAt", async () => {
    const readAt = "2026-05-24T14:00:00Z";
    stubFrom(
      makeBuilder({ data: { id: NOTIF_ID, read_at: readAt }, error: null }),
    );

    const result = await markNotificationRead(NOTIF_ID);
    expect(result).toEqual({ id: NOTIF_ID, readAt });
  });

  it("is idempotent — an already-read notification returns its existing readAt", async () => {
    const existingReadAt = "2026-05-24T10:00:00Z";
    // First (update where read_at is null) finds nothing; re-read returns the row.
    stubFrom(
      makeBuilder({ data: null, error: null }),
      makeBuilder({
        data: { id: NOTIF_ID, read_at: existingReadAt },
        error: null,
      }),
    );

    const result = await markNotificationRead(NOTIF_ID);
    expect(result).toEqual({ id: NOTIF_ID, readAt: existingReadAt });
  });

  it("404s a notification that is not the caller's / does not exist", async () => {
    stubFrom(
      makeBuilder({ data: null, error: null }), // no unread row updated
      makeBuilder({ data: null, error: null }), // re-read finds nothing
    );
    await expect(markNotificationRead(NOTIF_ID)).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it("404s a malformed id without querying", async () => {
    await expect(markNotificationRead("not-a-uuid")).rejects.toBeInstanceOf(
      NotFoundError,
    );
    expect(createServerSupabaseClient).not.toHaveBeenCalled();
  });
});

describe("markAllNotificationsRead", () => {
  it("returns how many unread rows were cleared", async () => {
    stubFrom(makeBuilder({ data: [{ id: "a" }, { id: "b" }], error: null }));
    await expect(markAllNotificationsRead()).resolves.toEqual({ updated: 2 });
  });
});
