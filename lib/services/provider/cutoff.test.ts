import { beforeEach, describe, expect, it, vi } from "vitest";

import { createServiceRoleClient } from "@/lib/db/service-role";
import {
  InternalError,
  NotFoundError,
  UnauthenticatedError,
} from "@/lib/errors";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/service-role", () => ({
  createServiceRoleClient: vi.fn(),
}));

import { processProviderCutoff } from "./cutoff";

const MENU_DAY = "44444444-4444-4444-4444-444444444444";
const BATCH = "66666666-6666-6666-6666-666666666666";

/** Stub the service-role client's single `.rpc()` call. */
function stubRpc(result: { data: unknown; error: unknown }) {
  const rpc = vi.fn().mockResolvedValue(result);
  vi.mocked(createServiceRoleClient).mockReturnValue({ rpc } as never);
  return rpc;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("processProviderCutoff", () => {
  it("calls the RPC with the menu day id and returns the batch id", async () => {
    const rpc = stubRpc({ data: BATCH, error: null });

    const result = await processProviderCutoff(MENU_DAY);

    expect(rpc).toHaveBeenCalledWith("process_provider_cutoff", {
      p_menu_day_id: MENU_DAY,
    });
    expect(result).toEqual({ batchId: BATCH });
  });

  it("returns a null batch id when the day was not a cutoff candidate", async () => {
    stubRpc({ data: null, error: null });

    await expect(processProviderCutoff(MENU_DAY)).resolves.toEqual({
      batchId: null,
    });
  });

  it("maps an unknown menu day (P0002) to a 404 NotFoundError", async () => {
    stubRpc({ data: null, error: { code: "P0002" } });

    await expect(processProviderCutoff(MENU_DAY)).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it("maps an unexpected RPC error to a 500 InternalError", async () => {
    stubRpc({ data: null, error: { code: "XX000", message: "boom" } });

    await expect(processProviderCutoff(MENU_DAY)).rejects.toBeInstanceOf(
      InternalError,
    );
  });

  it("maps a 28000 (no session) error to a 401 UnauthenticatedError", async () => {
    stubRpc({ data: null, error: { code: "28000" } });

    await expect(processProviderCutoff(MENU_DAY)).rejects.toBeInstanceOf(
      UnauthenticatedError,
    );
  });

  it("rejects a malformed menu day id with a 404 before any RPC call", async () => {
    const rpc = stubRpc({ data: BATCH, error: null });

    await expect(processProviderCutoff("not-a-uuid")).rejects.toBeInstanceOf(
      NotFoundError,
    );
    expect(rpc).not.toHaveBeenCalled();
  });
});
