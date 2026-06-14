import { beforeEach, describe, expect, it, vi } from "vitest";

import { requireAuthUser } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/db/server";
import {
  ConflictError,
  ForbiddenError,
  InternalError,
  NotFoundError,
  UnauthenticatedError,
} from "@/lib/errors";
import { PROVIDER_ERROR_REASONS } from "@/packages/shared/provider";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/server", () => ({ createServerSupabaseClient: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireAuthUser: vi.fn() }));

import {
  getProviderBatch,
  getProviderBatchForMenuDay,
  listProviderBatches,
} from "./batch-read";

const BATCH = "66666666-6666-6666-6666-666666666666";
const PROVIDER = "11111111-1111-1111-1111-111111111111";
const MENU_DAY = "44444444-4444-4444-4444-444444444444";

const BATCH_RESULT = {
  batchId: BATCH,
  menuDayId: "44444444-4444-4444-4444-444444444444",
  revision: 1,
  status: "current",
  generatedAt: "2026-06-13T18:00:00Z",
  emailStatus: "sent",
  providerName: "Tiffins by Asha",
  menuDate: "2026-06-13",
  cutoffAt: "2026-06-13T10:00:00Z",
  totals: { confirmed: 2, autoAccepted: 1, cancelled: 1, noResponse: 1 },
  aggregateLines: [],
  individualLines: [],
};

/** Stub the per-request client's single `.rpc()` call. */
function stubRpc(result: { data: unknown; error: unknown }) {
  const rpc = vi.fn().mockResolvedValue(result);
  vi.mocked(createServerSupabaseClient).mockResolvedValue({ rpc } as never);
  return rpc;
}

/**
 * A chainable PostgREST query-builder stub: every `.select`/`.eq` returns the builder,
 * and `.returns()`/`.maybeSingle()` resolve to the given `{ data, error }`. Lets us
 * exercise the request-scoped reads (`listProviderBatches`, the day→batch lookup).
 */
function chainable(resolved: { data: unknown; error: unknown }) {
  const builder: Record<string, unknown> = {};
  builder.select = vi.fn(() => builder);
  builder.eq = vi.fn(() => builder);
  builder.returns = vi.fn(() => Promise.resolve(resolved));
  builder.maybeSingle = vi.fn(() => Promise.resolve(resolved));
  return builder;
}

/** Stub a client whose `.from()` returns the chainable builder (and optional `.rpc`). */
function stubFrom(
  resolved: { data: unknown; error: unknown },
  rpcResult?: { data: unknown; error: unknown },
) {
  const builder = chainable(resolved);
  const from = vi.fn(() => builder);
  const rpc = rpcResult ? vi.fn().mockResolvedValue(rpcResult) : vi.fn();
  vi.mocked(createServerSupabaseClient).mockResolvedValue({
    from,
    rpc,
  } as never);
  return { from, rpc, builder };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireAuthUser).mockResolvedValue({ id: "owner" } as never);
});

describe("getProviderBatch", () => {
  it("calls get_provider_batch with the batch id and returns its payload", async () => {
    const rpc = stubRpc({ data: BATCH_RESULT, error: null });

    const result = await getProviderBatch(BATCH);

    expect(rpc).toHaveBeenCalledWith("get_provider_batch", {
      p_batch_id: BATCH,
    });
    expect(result).toEqual(BATCH_RESULT);
  });

  it("404s a non-uuid batch id without round-tripping", async () => {
    const rpc = stubRpc({ data: null, error: null });

    await expect(getProviderBatch("not-a-uuid")).rejects.toBeInstanceOf(
      NotFoundError,
    );
    expect(rpc).not.toHaveBeenCalled();
  });

  it("maps P0002 (missing/foreign batch) to a 404", async () => {
    stubRpc({
      data: null,
      error: { code: "P0002", message: "batch not found" },
    });
    await expect(getProviderBatch(BATCH)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("maps PROWN (non-owner) to a 403 carrying the provider_owner_required reason", async () => {
    stubRpc({
      data: null,
      error: { code: "PROWN", message: "provider owner required" },
    });
    const err = await getProviderBatch(BATCH).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ForbiddenError);
    expect((err as ForbiddenError).details).toMatchObject({
      reason: PROVIDER_ERROR_REASONS.provider_owner_required,
    });
  });

  it("maps PRSTL (superseded revision) to a 409 carrying the batch_stale reason", async () => {
    stubRpc({
      data: null,
      error: { code: "PRSTL", message: "batch superseded" },
    });
    const err = await getProviderBatch(BATCH).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ConflictError);
    expect((err as ConflictError).details).toMatchObject({
      reason: PROVIDER_ERROR_REASONS.batch_stale,
    });
  });

  it("maps 28000 (RLS/role denial) to an auth error", async () => {
    stubRpc({ data: null, error: { code: "28000", message: "denied" } });
    await expect(getProviderBatch(BATCH)).rejects.toBeInstanceOf(
      UnauthenticatedError,
    );
  });

  it("maps an unknown error to an internal error", async () => {
    stubRpc({ data: null, error: { code: "XX999", message: "boom" } });
    await expect(getProviderBatch(BATCH)).rejects.toBeInstanceOf(InternalError);
  });
});

function summaryRow(menuDate: string, batchId: string) {
  return {
    id: batchId,
    menu_day_id: MENU_DAY,
    revision: 1,
    status: "current" as const,
    generated_at: "2026-06-13T18:00:00Z",
    email_status: "sent" as const,
    total_confirmed: 2,
    total_auto_accepted: 1,
    total_cancelled: 1,
    total_no_response: 1,
    provider_menu_days: {
      menu_date: menuDate,
      cutoff_at: `${menuDate}T10:00:00Z`,
    },
  };
}

describe("listProviderBatches", () => {
  it("maps the current batches to summaries, newest day first", async () => {
    const { from } = stubFrom({
      data: [
        summaryRow("2026-06-12", "b-old"),
        summaryRow("2026-06-14", "b-new"),
      ],
      error: null,
    });

    const result = await listProviderBatches(PROVIDER);

    expect(from).toHaveBeenCalledWith("provider_preparation_batches");
    expect(result.map((b) => b.batchId)).toEqual(["b-new", "b-old"]);
    expect(result[0]).toMatchObject({
      menuDate: "2026-06-14",
      cutoffAt: "2026-06-14T10:00:00Z",
      revision: 1,
      status: "current",
      emailStatus: "sent",
      totals: { confirmed: 2, autoAccepted: 1, cancelled: 1, noResponse: 1 },
    });
  });

  it("returns an empty index for a non-uuid provider without round-tripping", async () => {
    const { from } = stubFrom({ data: [], error: null });
    await expect(listProviderBatches("not-a-uuid")).resolves.toEqual([]);
    expect(from).not.toHaveBeenCalled();
  });

  it("returns an empty index when the owner has no batches", async () => {
    stubFrom({ data: [], error: null });
    await expect(listProviderBatches(PROVIDER)).resolves.toEqual([]);
  });

  it("maps a query error to an internal error", async () => {
    stubFrom({ data: null, error: { code: "XX999", message: "boom" } });
    await expect(listProviderBatches(PROVIDER)).rejects.toBeInstanceOf(
      InternalError,
    );
  });
});

describe("getProviderBatchForMenuDay", () => {
  it("resolves the day's current batch then returns its detail", async () => {
    const { from, rpc } = stubFrom(
      { data: { id: BATCH }, error: null },
      { data: BATCH_RESULT, error: null },
    );

    const result = await getProviderBatchForMenuDay(MENU_DAY);

    expect(from).toHaveBeenCalledWith("provider_preparation_batches");
    expect(rpc).toHaveBeenCalledWith("get_provider_batch", {
      p_batch_id: BATCH,
    });
    expect(result).toEqual(BATCH_RESULT);
  });

  it("404s a non-uuid menu day without round-tripping", async () => {
    const { from } = stubFrom({ data: null, error: null });
    await expect(
      getProviderBatchForMenuDay("not-a-uuid"),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(from).not.toHaveBeenCalled();
  });

  it("404s when the day has no current batch (existence-hidden)", async () => {
    stubFrom({ data: null, error: null });
    await expect(getProviderBatchForMenuDay(MENU_DAY)).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it("maps a lookup error to an internal error", async () => {
    stubFrom({ data: null, error: { code: "XX999", message: "boom" } });
    await expect(getProviderBatchForMenuDay(MENU_DAY)).rejects.toBeInstanceOf(
      InternalError,
    );
  });
});
