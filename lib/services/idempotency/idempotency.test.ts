import { beforeEach, describe, expect, it, vi } from "vitest";

import { ConflictError } from "@/lib/errors";

// `idempotency.ts` is server-only and uses the per-request Supabase client. Stub
// the marker and the client factory so we can drive the replay logic in a plain
// Node test.
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/server", () => ({ createServerSupabaseClient: vi.fn() }));

import { createServerSupabaseClient } from "@/lib/db/server";
import { requestHash } from "./hash";
import { withIdempotency } from "./idempotency";

const HOUSEHOLD = "11111111-1111-1111-1111-111111111111";
const ENDPOINT = "meal-plans/today/generate";
const REQUEST = { date: "2026-06-02", mealSlot: "dinner" };
const RESULT = { mealPlanId: "p1", items: [{ id: "i1" }] };

type StoredKey = {
  request_hash: string;
  response_status: number;
  response_body: unknown;
} | null;

/**
 * Build a fake Supabase client whose `select(...).eq...gt.maybeSingle()` returns
 * `selectResults` in call order, and whose `insert(...)` resolves to
 * `{ error: insertError }`.
 */
function fakeSupabase(opts: {
  selectResults?: StoredKey[];
  insertError?: { code?: string } | null;
}) {
  const selectResults = opts.selectResults ?? [];
  let i = 0;
  const insert = vi.fn(async () => ({ error: opts.insertError ?? null }));
  const builder: Record<string, unknown> = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    gt: vi.fn(() => builder),
    maybeSingle: vi.fn(async () => ({
      data: selectResults[i++] ?? null,
      error: null,
    })),
    insert,
  };
  const from = vi.fn(() => builder);
  return { client: { from }, insert, from, builder };
}

const mockedFactory = vi.mocked(createServerSupabaseClient);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("withIdempotency", () => {
  it("runs without persistence when no key is present", async () => {
    const run = vi.fn(async () => RESULT);

    const res = await withIdempotency({
      householdId: HOUSEHOLD,
      key: null,
      endpoint: ENDPOINT,
      request: REQUEST,
      successStatus: 201,
      run,
    });

    expect(run).toHaveBeenCalledTimes(1);
    expect(mockedFactory).not.toHaveBeenCalled(); // never touches the DB
    expect(res.status).toBe(201);
    expect(res.headers.get("Idempotency-Replayed")).toBeNull();
    await expect(res.json()).resolves.toEqual(RESULT);
  });

  it("first use of a key runs, persists the response, and returns it (201)", async () => {
    const { client, insert } = fakeSupabase({ selectResults: [null] });
    mockedFactory.mockResolvedValue(client as never);
    const run = vi.fn(async () => RESULT);

    const res = await withIdempotency({
      householdId: HOUSEHOLD,
      key: "key-abc",
      endpoint: ENDPOINT,
      request: REQUEST,
      successStatus: 201,
      run,
    });

    expect(run).toHaveBeenCalledTimes(1);
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        household_id: HOUSEHOLD,
        idempotency_key: "key-abc",
        endpoint: ENDPOINT,
        request_hash: requestHash(ENDPOINT, REQUEST),
        response_status: 201,
        response_body: RESULT,
      }),
    );
    expect(res.status).toBe(201);
    expect(res.headers.get("Idempotency-Replayed")).toBeNull();
    await expect(res.json()).resolves.toEqual(RESULT);
  });

  it("replays the stored response on a matching retry without re-running", async () => {
    const stored = {
      request_hash: requestHash(ENDPOINT, REQUEST),
      response_status: 201,
      response_body: RESULT,
    };
    const { client, insert } = fakeSupabase({ selectResults: [stored] });
    mockedFactory.mockResolvedValue(client as never);
    const run = vi.fn(async () => RESULT);

    const res = await withIdempotency({
      householdId: HOUSEHOLD,
      key: "key-abc",
      endpoint: ENDPOINT,
      request: REQUEST,
      successStatus: 201,
      run,
    });

    expect(run).not.toHaveBeenCalled(); // generator does NOT re-run
    expect(insert).not.toHaveBeenCalled();
    expect(res.status).toBe(201);
    expect(res.headers.get("Idempotency-Replayed")).toBe("true");
    await expect(res.json()).resolves.toEqual(RESULT);
  });

  it("409s when the same key is reused for a different request", async () => {
    const stored = {
      request_hash: requestHash(ENDPOINT, {
        date: "2026-06-02",
        mealSlot: "lunch",
      }),
      response_status: 201,
      response_body: RESULT,
    };
    const { client } = fakeSupabase({ selectResults: [stored] });
    mockedFactory.mockResolvedValue(client as never);
    const run = vi.fn(async () => RESULT);

    const promise = withIdempotency({
      householdId: HOUSEHOLD,
      key: "key-abc",
      endpoint: ENDPOINT,
      request: REQUEST, // dinner, not lunch → hash mismatch
      successStatus: 201,
      run,
    });

    await expect(promise).rejects.toBeInstanceOf(ConflictError);
    await promise.catch((e: ConflictError) => {
      expect(e.details).toEqual({ reason: "idempotency_key_reused" });
    });
    expect(run).not.toHaveBeenCalled();
  });

  it("replays the winner's response when a concurrent insert wins the race", async () => {
    const winner = {
      request_hash: requestHash(ENDPOINT, REQUEST),
      response_status: 201,
      response_body: RESULT,
    };
    // First lookup misses; insert hits a unique violation; re-read returns winner.
    const { client, insert, builder } = fakeSupabase({
      selectResults: [null, winner],
      insertError: { code: "23505" },
    });
    mockedFactory.mockResolvedValue(client as never);
    const run = vi.fn(async () => RESULT);

    const res = await withIdempotency({
      householdId: HOUSEHOLD,
      key: "key-abc",
      endpoint: ENDPOINT,
      request: REQUEST,
      successStatus: 201,
      run,
    });

    expect(run).toHaveBeenCalledTimes(1); // this caller did run, but loses the insert
    expect(insert).toHaveBeenCalledTimes(1);
    // Proves the recovery actually re-read the winner (initial miss + re-read),
    // rather than just echoing this caller's local result on the 23505.
    expect(builder.maybeSingle).toHaveBeenCalledTimes(2);
    expect(res.status).toBe(201);
    expect(res.headers.get("Idempotency-Replayed")).toBe("true");
    await expect(res.json()).resolves.toEqual(RESULT);
  });

  it("re-asserts authorization before serving a replay", async () => {
    const stored = {
      request_hash: requestHash(ENDPOINT, REQUEST),
      response_status: 201,
      response_body: RESULT,
    };
    const { client } = fakeSupabase({ selectResults: [stored] });
    mockedFactory.mockResolvedValue(client as never);
    const run = vi.fn(async () => RESULT);
    const authorize = vi.fn(async () => {
      throw new ConflictError("forbidden", { reason: "x" });
    });

    const promise = withIdempotency({
      householdId: HOUSEHOLD,
      key: "key-abc",
      endpoint: ENDPOINT,
      request: REQUEST,
      successStatus: 201,
      run,
      authorize,
    });

    // The replay path must run the guard; a revoked caller is rejected, not served.
    await expect(promise).rejects.toBeInstanceOf(ConflictError);
    expect(authorize).toHaveBeenCalledTimes(1);
    expect(run).not.toHaveBeenCalled();
  });
});
