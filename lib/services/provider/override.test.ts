import { beforeEach, describe, expect, it, vi } from "vitest";

import { requireAuthUser } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/db/server";
import {
  ConflictError,
  ForbiddenError,
  InternalError,
  NotFoundError,
  UnauthenticatedError,
  ValidationError,
} from "@/lib/errors";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/server", () => ({ createServerSupabaseClient: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireAuthUser: vi.fn() }));

import { overrideResponse, regenerateBatch } from "./override";

const RESPONSE = "55555555-5555-5555-5555-555555555555";
const MENU_DAY = "44444444-4444-4444-4444-444444444444";
const BATCH = "66666666-6666-6666-6666-666666666666";
const COMP = "11111111-1111-1111-1111-111111111111";
const ITEM = "22222222-2222-2222-2222-222222222222";

const OVERRIDE_BODY = {
  reason: "  short on Item A, swap to B  ",
  items: [
    {
      menuComponentId: COMP,
      selectedCatalogItemId: ITEM,
      quantity: 999, // ignored — server-derived
      canonicalUnit: "ignored",
      spiceLevel: null,
      saltLevel: null,
      customizations: [],
    },
  ],
};

const OVERRIDE_RESULT = {
  responseId: RESPONSE,
  menuDayId: MENU_DAY,
  status: "provider_overridden",
  staleBatchId: BATCH,
};

const REVISION_RESULT = {
  batchId: "77777777-7777-7777-7777-777777777777",
  menuDayId: MENU_DAY,
  revision: 2,
  status: "current",
  generatedAt: "2026-06-13T18:00:00Z",
  totals: { confirmed: 2, autoAccepted: 0, cancelled: 0, noResponse: 0 },
  emailStatus: null,
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

describe("overrideResponse", () => {
  it("calls the RPC with the trimmed reason + derived-free items, returns the result", async () => {
    const rpc = stubRpc({ data: OVERRIDE_RESULT, error: null });

    const result = await overrideResponse(RESPONSE, OVERRIDE_BODY as never);

    expect(rpc).toHaveBeenCalledWith("provider_override_response", {
      p_response_id: RESPONSE,
      p_reason: "short on Item A, swap to B",
      p_items: [
        {
          menuComponentId: COMP,
          selectedCatalogItemId: ITEM,
          spiceLevel: null,
          saltLevel: null,
          customizations: [],
        },
      ],
    });
    expect(result).toEqual(OVERRIDE_RESULT);
  });

  it("404s a malformed response id without an RPC call", async () => {
    const rpc = stubRpc({ data: null, error: null });
    await expect(
      overrideResponse("nope", OVERRIDE_BODY as never),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("rejects a missing reason as a ValidationError without an RPC call", async () => {
    const rpc = stubRpc({ data: null, error: null });
    await expect(
      overrideResponse(RESPONSE, { reason: "   ", items: [] } as never),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("maps PROWN → FORBIDDEN provider_owner_required", async () => {
    stubRpc({ data: null, error: { code: "PROWN" } });
    const err = await overrideResponse(RESPONSE, OVERRIDE_BODY as never).catch(
      (e) => e,
    );
    expect(err).toBeInstanceOf(ForbiddenError);
    expect((err as ForbiddenError).details).toMatchObject({
      reason: "provider_owner_required",
    });
  });

  it("maps PRRSN → VALIDATION_ERROR on the reason field", async () => {
    stubRpc({ data: null, error: { code: "PRRSN" } });
    const err = await overrideResponse(RESPONSE, OVERRIDE_BODY as never).catch(
      (e) => e,
    );
    expect(err).toBeInstanceOf(ValidationError);
    expect((err as ValidationError).details).toContainEqual({
      field: "reason",
      rule: "required",
    });
  });

  it("maps PRNLK → CONFLICT menu_not_locked", async () => {
    stubRpc({ data: null, error: { code: "PRNLK" } });
    const err = await overrideResponse(RESPONSE, OVERRIDE_BODY as never).catch(
      (e) => e,
    );
    expect(err).toBeInstanceOf(ConflictError);
    expect((err as ConflictError).details).toMatchObject({
      reason: "menu_not_locked",
    });
  });

  it("maps PRALT → VALIDATION_ERROR invalid_menu_alternative", async () => {
    stubRpc({ data: null, error: { code: "PRALT" } });
    const err = await overrideResponse(RESPONSE, OVERRIDE_BODY as never).catch(
      (e) => e,
    );
    expect(err).toBeInstanceOf(ValidationError);
    expect((err as ValidationError).details).toContainEqual({
      field: "items",
      rule: "invalid_menu_alternative",
    });
  });

  it("maps a missing response (P0002) → 404", async () => {
    stubRpc({ data: null, error: { code: "P0002" } });
    await expect(
      overrideResponse(RESPONSE, OVERRIDE_BODY as never),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("maps a deadlock (40P01) → CONFLICT (clean retryable)", async () => {
    stubRpc({ data: null, error: { code: "40P01" } });
    await expect(
      overrideResponse(RESPONSE, OVERRIDE_BODY as never),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("maps 28000 → UnauthenticatedError", async () => {
    stubRpc({ data: null, error: { code: "28000" } });
    await expect(
      overrideResponse(RESPONSE, OVERRIDE_BODY as never),
    ).rejects.toBeInstanceOf(UnauthenticatedError);
  });

  it("maps an unknown RPC error to InternalError", async () => {
    stubRpc({ data: null, error: { code: "XX999" } });
    await expect(
      overrideResponse(RESPONSE, OVERRIDE_BODY as never),
    ).rejects.toBeInstanceOf(InternalError);
  });
});

describe("regenerateBatch", () => {
  it("calls the RPC with the batch id and returns the new revision", async () => {
    const rpc = stubRpc({ data: REVISION_RESULT, error: null });

    const result = await regenerateBatch(BATCH);

    expect(rpc).toHaveBeenCalledWith("regenerate_provider_batch", {
      p_batch_id: BATCH,
    });
    expect(result).toEqual(REVISION_RESULT);
  });

  it("404s a malformed batch id without an RPC call", async () => {
    const rpc = stubRpc({ data: null, error: null });
    await expect(regenerateBatch("nope")).rejects.toBeInstanceOf(NotFoundError);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("maps PROWN → FORBIDDEN provider_owner_required", async () => {
    stubRpc({ data: null, error: { code: "PROWN" } });
    const err = await regenerateBatch(BATCH).catch((e) => e);
    expect(err).toBeInstanceOf(ForbiddenError);
    expect((err as ForbiddenError).details).toMatchObject({
      reason: "provider_owner_required",
    });
  });

  it("maps a missing batch (P0002) → 404", async () => {
    stubRpc({ data: null, error: { code: "P0002" } });
    await expect(regenerateBatch(BATCH)).rejects.toBeInstanceOf(NotFoundError);
  });
});
