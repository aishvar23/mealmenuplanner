import { beforeEach, describe, expect, it, vi } from "vitest";

import { requireAuthUser } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/db/server";
import {
  ForbiddenError,
  InternalError,
  NotFoundError,
  UnauthenticatedError,
} from "@/lib/errors";
import { PROVIDER_ERROR_REASONS } from "@/packages/shared/provider";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/server", () => ({ createServerSupabaseClient: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireAuthUser: vi.fn() }));

import { getProviderBatch } from "./batch-read";

const BATCH = "66666666-6666-6666-6666-666666666666";

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
