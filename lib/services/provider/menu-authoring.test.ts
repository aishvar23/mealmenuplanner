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
import { providerFixtures } from "@/packages/shared/provider";
import type { MenuDayDto } from "@/packages/shared/provider";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/server", () => ({ createServerSupabaseClient: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireAuthUser: vi.fn() }));
vi.mock("./access", () => ({ requireProviderOwner: vi.fn() }));
vi.mock("./menu-read", () => ({ getMenuDay: vi.fn() }));

import { requireProviderOwner } from "./access";
import { getMenuDay } from "./menu-read";
import { createMenuDay } from "./menu-authoring";

const PROVIDER = "33333333-3333-3333-3333-333333333333";
const ITEM = "11111111-1111-1111-1111-111111111111";
const NEW_DAY = "44444444-4444-4444-4444-444444444444";

const CREATED_DAY: MenuDayDto = {
  ...providerFixtures.publishedMenuDay,
  menuDayId: NEW_DAY,
  status: "draft",
  publishedAt: null,
};

/** A minimal-but-valid create body. */
function body(overrides: Record<string, unknown> = {}) {
  return {
    menuDate: "2030-03-15",
    cutoffAt: "2030-03-15T10:00:00.000Z",
    components: [{ componentGroup: "main", defaultCatalogItemId: ITEM }],
    ...overrides,
  };
}

/** Stub the per-request client's single `.rpc()` call. */
function stubRpc(result: { data: unknown; error: unknown }) {
  const rpc = vi.fn().mockResolvedValue(result);
  vi.mocked(createServerSupabaseClient).mockResolvedValue({ rpc } as never);
  return rpc;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireAuthUser).mockResolvedValue({ id: "owner" } as never);
  vi.mocked(requireProviderOwner).mockResolvedValue(undefined);
  vi.mocked(getMenuDay).mockResolvedValue(CREATED_DAY);
});

describe("createMenuDay", () => {
  it("authors a day via the RPC and returns the read-back DTO", async () => {
    const rpc = stubRpc({ data: NEW_DAY, error: null });

    const result = await createMenuDay(PROVIDER, body());

    expect(rpc).toHaveBeenCalledWith("create_provider_menu_day", {
      p_provider_id: PROVIDER,
      p_payload: expect.objectContaining({
        menuDate: "2030-03-15",
        components: expect.any(Array),
      }),
    });
    expect(getMenuDay).toHaveBeenCalledWith(NEW_DAY);
    expect(result).toBe(CREATED_DAY);
  });

  it("gates ownership BEFORE validating or writing (non-owner → 404)", async () => {
    vi.mocked(requireProviderOwner).mockRejectedValue(
      new NotFoundError("Provider not found."),
    );
    const rpc = stubRpc({ data: null, error: null });

    await expect(createMenuDay(PROVIDER, body())).rejects.toBeInstanceOf(
      NotFoundError,
    );
    expect(rpc).not.toHaveBeenCalled();
  });

  it("rejects an invalid body with a 400 BEFORE the RPC", async () => {
    const rpc = stubRpc({ data: null, error: null });

    await expect(
      createMenuDay(PROVIDER, body({ components: [] })),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("maps MAOWN → 403 owner-required", async () => {
    stubRpc({
      data: null,
      error: { code: "MAOWN", message: "owner required" },
    });
    await expect(createMenuDay(PROVIDER, body())).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });

  it("maps MADUP → 409 menu-day-exists", async () => {
    stubRpc({ data: null, error: { code: "MADUP", message: "exists" } });
    const error = await createMenuDay(PROVIDER, body()).catch(
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(ConflictError);
    expect((error as ConflictError).details?.reason).toBe("menu_day_exists");
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

    const error = await createMenuDay(PROVIDER, body()).catch(
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(ValidationError);
    const issues = (error as ValidationError).details ?? [];
    expect(issues[0]?.rule).toBe("inactive_or_cross_provider_item");
  });

  it("maps MAINC with no detail to a generic menu_incomplete issue", async () => {
    stubRpc({ data: null, error: { code: "MAINC", message: "incomplete" } });
    const error = await createMenuDay(PROVIDER, body()).catch(
      (e: unknown) => e,
    );
    expect((error as ValidationError).details?.[0]?.rule).toBe(
      "menu_incomplete",
    );
  });

  it("maps a customization CHECK violation (23514) to invalid_customization", async () => {
    stubRpc({ data: null, error: { code: "23514", message: "check" } });
    const error = await createMenuDay(PROVIDER, body()).catch(
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(ValidationError);
    expect((error as ValidationError).details?.[0]?.rule).toBe(
      "invalid_customization",
    );
  });

  it("maps a duplicate alternative (23505) to a 400 duplicate", async () => {
    stubRpc({ data: null, error: { code: "23505", message: "dup" } });
    await expect(createMenuDay(PROVIDER, body())).rejects.toBeInstanceOf(
      ValidationError,
    );
  });

  it("maps a missing session (28000) to a 401", async () => {
    stubRpc({ data: null, error: { code: "28000", message: "auth" } });
    await expect(createMenuDay(PROVIDER, body())).rejects.toBeInstanceOf(
      UnauthenticatedError,
    );
  });

  it("maps an unexpected SQLSTATE to a 500 (original kept as cause)", async () => {
    stubRpc({ data: null, error: { code: "XX000", message: "boom" } });
    await expect(createMenuDay(PROVIDER, body())).rejects.toBeInstanceOf(
      InternalError,
    );
  });
});
