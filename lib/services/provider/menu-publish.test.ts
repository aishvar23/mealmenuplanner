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
vi.mock("./menu-read", () => ({ getMenuDay: vi.fn() }));

import { getMenuDay } from "./menu-read";
import { publishMenuDay } from "./menu-publish";

const MENU_DAY = "44444444-4444-4444-4444-444444444444";

/** A draft that is STRUCTURALLY publishable (far-future cutoff so it never lapses). */
const DRAFT_DAY: MenuDayDto = {
  ...providerFixtures.publishedMenuDay,
  menuDayId: MENU_DAY,
  status: "draft",
  publishedAt: null,
  cutoffAt: "2099-01-01T00:00:00Z",
};

const PUBLISHED_DAY: MenuDayDto = {
  ...DRAFT_DAY,
  status: "published",
  publishedAt: "2099-01-01T00:00:00Z",
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

describe("publishMenuDay", () => {
  it("rejects a malformed id with a 404 before any read or write", async () => {
    const rpc = stubRpc({ data: null, error: null });

    await expect(publishMenuDay("not-a-uuid")).rejects.toBeInstanceOf(
      NotFoundError,
    );
    expect(getMenuDay).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("publishes a complete draft via the RPC, then re-reads the published DTO", async () => {
    vi.mocked(getMenuDay)
      .mockResolvedValueOnce(DRAFT_DAY) // structural read
      .mockResolvedValueOnce(PUBLISHED_DAY); // re-read after publish
    const rpc = stubRpc({ data: MENU_DAY, error: null });

    const result = await publishMenuDay(MENU_DAY);

    expect(rpc).toHaveBeenCalledWith("publish_provider_menu_day", {
      p_menu_day_id: MENU_DAY,
    });
    expect(result).toBe(PUBLISHED_DAY);
    expect(getMenuDay).toHaveBeenCalledTimes(2);
  });

  it("blocks a structurally-incomplete menu with menu_incomplete BEFORE the RPC", async () => {
    vi.mocked(getMenuDay).mockResolvedValue({
      ...DRAFT_DAY,
      components: [], // empty menu → structural failure
    });
    const rpc = stubRpc({ data: null, error: null });

    await expect(publishMenuDay(MENU_DAY)).rejects.toBeInstanceOf(
      ValidationError,
    );
    expect(rpc).not.toHaveBeenCalled();
  });

  it("surfaces a structural cutoff-in-the-past failure as a ValidationError", async () => {
    vi.mocked(getMenuDay).mockResolvedValue({
      ...DRAFT_DAY,
      cutoffAt: "2000-01-01T00:00:00Z",
    });
    const rpc = stubRpc({ data: null, error: null });

    await expect(publishMenuDay(MENU_DAY)).rejects.toBeInstanceOf(
      ValidationError,
    );
    expect(rpc).not.toHaveBeenCalled();
  });

  it("maps PMOWN → 403 owner-required", async () => {
    vi.mocked(getMenuDay).mockResolvedValue(DRAFT_DAY);
    stubRpc({
      data: null,
      error: { code: "PMOWN", message: "owner required" },
    });

    await expect(publishMenuDay(MENU_DAY)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });

  it("maps PMNDR → 409 menu-not-draft", async () => {
    vi.mocked(getMenuDay).mockResolvedValue(DRAFT_DAY);
    stubRpc({ data: null, error: { code: "PMNDR", message: "not a draft" } });

    await expect(publishMenuDay(MENU_DAY)).rejects.toBeInstanceOf(
      ConflictError,
    );
  });

  it("maps PMINC → 400 with the per-reference issues parsed from the error detail", async () => {
    vi.mocked(getMenuDay).mockResolvedValue(DRAFT_DAY);
    const detail = JSON.stringify([
      {
        field: "components",
        rule: "inactive_or_cross_provider_item",
        menuComponentId: "c1",
        catalogItemId: "i1",
      },
    ]);
    stubRpc({
      data: null,
      error: { code: "PMINC", message: "incomplete", details: detail },
    });

    const error = await publishMenuDay(MENU_DAY).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ValidationError);
    const issues = (error as ValidationError).details ?? [];
    expect(issues).toHaveLength(1);
    expect(issues[0]?.rule).toBe("inactive_or_cross_provider_item");
  });

  it("maps PMINC with no detail to a generic menu_incomplete issue", async () => {
    vi.mocked(getMenuDay).mockResolvedValue(DRAFT_DAY);
    stubRpc({ data: null, error: { code: "PMINC", message: "incomplete" } });

    const error = await publishMenuDay(MENU_DAY).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ValidationError);
    expect((error as ValidationError).details?.[0]?.rule).toBe(
      "menu_incomplete",
    );
  });

  it("maps an unknown / not-visible day (P0002) to an existence-hiding 404", async () => {
    vi.mocked(getMenuDay).mockResolvedValue(DRAFT_DAY);
    stubRpc({ data: null, error: { code: "P0002", message: "not found" } });

    await expect(publishMenuDay(MENU_DAY)).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it("maps a missing session (28000) to a 401", async () => {
    vi.mocked(getMenuDay).mockResolvedValue(DRAFT_DAY);
    stubRpc({ data: null, error: { code: "28000", message: "auth required" } });

    await expect(publishMenuDay(MENU_DAY)).rejects.toBeInstanceOf(
      UnauthenticatedError,
    );
  });

  it("maps an unexpected SQLSTATE to a 500 (original kept as cause)", async () => {
    vi.mocked(getMenuDay).mockResolvedValue(DRAFT_DAY);
    stubRpc({ data: null, error: { code: "23505", message: "boom" } });

    await expect(publishMenuDay(MENU_DAY)).rejects.toBeInstanceOf(
      InternalError,
    );
  });
});
