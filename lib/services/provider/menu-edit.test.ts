import { beforeEach, describe, expect, it, vi } from "vitest";

import { createServerSupabaseClient } from "@/lib/db/server";
import {
  ConflictError,
  ForbiddenError,
  InternalError,
  NotFoundError,
  UnauthenticatedError,
  ValidationError,
} from "@/lib/errors";
import { providerFixtures } from "@/packages/shared/provider";
import type { MenuDayDto } from "@/packages/shared/provider";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/server", () => ({ createServerSupabaseClient: vi.fn() }));
vi.mock("./menu-read", () => ({ getMenuDay: vi.fn() }));

import { getMenuDay } from "./menu-read";
import { reviseMenuDay, updateMenuDayNote } from "./menu-edit";

const MENU_DAY = "44444444-4444-4444-4444-444444444444";
const NEW_DAY = "55555555-5555-5555-5555-555555555555";
const ITEM = "11111111-1111-1111-1111-111111111111";

const READ_DAY: MenuDayDto = { ...providerFixtures.publishedMenuDay };

/** A minimal-but-valid edit body (no menuDate — the day's date is immutable). */
function body(overrides: Record<string, unknown> = {}) {
  return {
    cutoffAt: "2030-03-15T10:00:00.000Z",
    note: "edited",
    components: [{ componentGroup: "main", defaultCatalogItemId: ITEM }],
    ...overrides,
  };
}

function stubRpc(result: { data: unknown; error: unknown }) {
  const rpc = vi.fn().mockResolvedValue(result);
  vi.mocked(createServerSupabaseClient).mockResolvedValue({ rpc } as never);
  return rpc;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getMenuDay).mockResolvedValue(READ_DAY);
});

describe("reviseMenuDay", () => {
  it("edits via the RPC (injecting the day's immutable date) and reads back the live day", async () => {
    const rpc = stubRpc({ data: NEW_DAY, error: null });

    const result = await reviseMenuDay(MENU_DAY, body());

    // The day's existing date is injected so the shared authoring validator runs.
    expect(rpc).toHaveBeenCalledWith("edit_provider_menu_day", {
      p_menu_day_id: MENU_DAY,
      p_payload: expect.objectContaining({
        menuDate: READ_DAY.menuDate,
        cutoffAt: "2030-03-15T10:00:00.000Z",
        components: expect.any(Array),
      }),
    });
    // Read once for the initial existence/date load, then again on the live day id.
    expect(getMenuDay).toHaveBeenNthCalledWith(1, MENU_DAY);
    expect(getMenuDay).toHaveBeenNthCalledWith(2, NEW_DAY);
    expect(result).toBe(READ_DAY);
  });

  it("rejects a malformed id with a 404 before any read", async () => {
    const rpc = stubRpc({ data: null, error: null });
    await expect(reviseMenuDay("not-a-uuid", body())).rejects.toBeInstanceOf(
      NotFoundError,
    );
    expect(getMenuDay).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("rejects an invalid body with a 400 before the RPC", async () => {
    const rpc = stubRpc({ data: null, error: null });
    await expect(
      reviseMenuDay(MENU_DAY, body({ components: [] })),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("maps MEOWN → 403 owner-required", async () => {
    stubRpc({ data: null, error: { code: "MEOWN", message: "owner" } });
    await expect(reviseMenuDay(MENU_DAY, body())).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });

  it("maps MESTA → 409 menu_not_editable", async () => {
    stubRpc({ data: null, error: { code: "MESTA", message: "state" } });
    const error = await reviseMenuDay(MENU_DAY, body()).catch(
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(ConflictError);
    expect((error as ConflictError).details?.reason).toBe("menu_not_editable");
  });

  it("maps MECUT → 400 cutoff_invalid", async () => {
    stubRpc({ data: null, error: { code: "MECUT", message: "cutoff" } });
    const error = await reviseMenuDay(MENU_DAY, body()).catch(
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(ValidationError);
    expect((error as ValidationError).details?.[0]?.rule).toBe(
      "cutoff_invalid",
    );
  });

  it("maps MAINC → 400 with the per-reference issues parsed from the detail", async () => {
    const detail = JSON.stringify([
      {
        field: "components",
        rule: "inactive_or_cross_provider_item",
        catalogItemId: ITEM,
        ref: "default",
      },
    ]);
    stubRpc({
      data: null,
      error: { code: "MAINC", message: "incomplete", details: detail },
    });
    const error = await reviseMenuDay(MENU_DAY, body()).catch(
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(ValidationError);
    expect((error as ValidationError).details?.[0]?.rule).toBe(
      "inactive_or_cross_provider_item",
    );
  });

  it("maps P0002 → 404 (existence-hidden)", async () => {
    stubRpc({ data: null, error: { code: "P0002", message: "gone" } });
    await expect(reviseMenuDay(MENU_DAY, body())).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it("maps a missing session (28000) → 401", async () => {
    stubRpc({ data: null, error: { code: "28000", message: "auth" } });
    await expect(reviseMenuDay(MENU_DAY, body())).rejects.toBeInstanceOf(
      UnauthenticatedError,
    );
  });

  it("maps a deadlock (40P01) → CONFLICT (clean retryable, not a 500)", async () => {
    stubRpc({ data: null, error: { code: "40P01", message: "deadlock" } });
    await expect(reviseMenuDay(MENU_DAY, body())).rejects.toBeInstanceOf(
      ConflictError,
    );
  });

  it("maps a serialization failure (40001) → CONFLICT", async () => {
    stubRpc({ data: null, error: { code: "40001", message: "serialize" } });
    await expect(reviseMenuDay(MENU_DAY, body())).rejects.toBeInstanceOf(
      ConflictError,
    );
  });

  it("maps an unexpected SQLSTATE → 500", async () => {
    stubRpc({ data: null, error: { code: "XX000", message: "boom" } });
    await expect(reviseMenuDay(MENU_DAY, body())).rejects.toBeInstanceOf(
      InternalError,
    );
  });
});

describe("updateMenuDayNote", () => {
  it("updates the note in place via the RPC and reads back the same day", async () => {
    const rpc = stubRpc({ data: null, error: null });

    await updateMenuDayNote(MENU_DAY, { note: "new note" });

    expect(rpc).toHaveBeenCalledWith("update_provider_menu_day_note", {
      p_menu_day_id: MENU_DAY,
      p_note: "new note",
    });
    expect(getMenuDay).toHaveBeenNthCalledWith(2, MENU_DAY);
  });

  it("clears the note (null) when omitted", async () => {
    const rpc = stubRpc({ data: null, error: null });
    await updateMenuDayNote(MENU_DAY, { note: null });
    expect(rpc).toHaveBeenCalledWith("update_provider_menu_day_note", {
      p_menu_day_id: MENU_DAY,
      p_note: null,
    });
  });

  it("rejects a non-string note with a 400 before the RPC", async () => {
    const rpc = stubRpc({ data: null, error: null });
    await expect(
      updateMenuDayNote(MENU_DAY, { note: 42 as never }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("maps MEOWN → 403 and MESTA → 409 menu_not_editable", async () => {
    stubRpc({ data: null, error: { code: "MEOWN", message: "owner" } });
    await expect(
      updateMenuDayNote(MENU_DAY, { note: "x" }),
    ).rejects.toBeInstanceOf(ForbiddenError);

    stubRpc({ data: null, error: { code: "MESTA", message: "state" } });
    const error = await updateMenuDayNote(MENU_DAY, { note: "x" }).catch(
      (e: unknown) => e,
    );
    expect((error as ConflictError).details?.reason).toBe("menu_not_editable");
  });

  it("maps a deadlock (40P01) → CONFLICT (clean retryable)", async () => {
    stubRpc({ data: null, error: { code: "40P01", message: "deadlock" } });
    await expect(
      updateMenuDayNote(MENU_DAY, { note: "x" }),
    ).rejects.toBeInstanceOf(ConflictError);
  });
});
