import { beforeEach, describe, expect, it, vi } from "vitest";

import { requireAuthUser } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/db/server";
import { NotFoundError, ValidationError } from "@/lib/errors";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/server", () => ({ createServerSupabaseClient: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireAuthUser: vi.fn() }));

import {
  createCatalogItem,
  listProviderCatalog,
  updateCatalogItem,
} from "./catalog";

const USER_ID = "11111111-1111-1111-1111-111111111111";
const PROVIDER_ID = "22222222-2222-2222-2222-222222222222";
const ITEM_ID = "33333333-3333-3333-3333-333333333333";

const ROW = {
  id: ITEM_ID,
  name: "Rajma",
  component_group: "dal_or_legume",
  canonical_unit: "oz",
  default_quantity: "16", // numeric arrives as a string via PostgREST
  image_url: null,
  is_active: true,
  supports_spice_level: true,
  supports_salt_level: true,
  allergy_warning: null,
  source_dish_id: null,
};

const DTO = {
  catalogItemId: ITEM_ID,
  name: "Rajma",
  componentGroup: "dal_or_legume",
  canonicalUnit: "oz",
  defaultQuantity: 16,
  imageUrl: null,
  isActive: true,
  supportsSpiceLevel: true,
  supportsSaltLevel: true,
  allergyWarning: null,
  sourceDishId: null,
};

const VALID_CREATE = {
  name: "Rajma",
  componentGroup: "dal_or_legume",
  canonicalUnit: "oz",
  defaultQuantity: 16,
};

/**
 * A chainable Supabase query mock: every builder method returns the chain, the
 * chain is awaitable (resolves to `result`, for the list query), and the terminal
 * `single`/`maybeSingle` also resolve to `result`. `calls` records method names.
 */
function makeChain(result: { data: unknown; error: unknown }) {
  const calls: Record<string, unknown[][]> = {};
  const chain: Record<string, unknown> = {};
  for (const m of ["select", "eq", "order", "insert", "update"]) {
    chain[m] = (...args: unknown[]) => {
      (calls[m] ??= []).push(args);
      return chain;
    };
  }
  chain.single = () => Promise.resolve(result);
  chain.maybeSingle = () => Promise.resolve(result);
  // Awaiting the builder directly (the list query has no terminal).
  chain.then = (onF: (v: unknown) => unknown) =>
    Promise.resolve(result).then(onF);
  return { chain, calls };
}

/**
 * Stub the Supabase client. `owner` is the `is_provider_owner` RPC result the
 * draft-safe ownership gate reads (defaults to owner=true so the table query under
 * test is reached); pass `{ data: false }` to exercise the non-owner gate.
 */
function stubFrom(
  result: { data: unknown; error: unknown },
  owner: { data: unknown; error: unknown } = { data: true, error: null },
) {
  const { chain, calls } = makeChain(result);
  const from = vi.fn(() => chain);
  const rpc = vi.fn(() => Promise.resolve(owner));
  vi.mocked(createServerSupabaseClient).mockResolvedValue({
    from,
    rpc,
  } as never);
  return { from, rpc, calls };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireAuthUser).mockResolvedValue({ id: USER_ID } as never);
});

describe("listProviderCatalog", () => {
  it("maps rows to DTOs and coerces the numeric quantity", async () => {
    stubFrom({ data: [ROW], error: null });
    const result = await listProviderCatalog(PROVIDER_ID);
    expect(result).toEqual([DTO]);
  });

  it("scopes the query to the provider id and orders by group then name", async () => {
    const { from, calls } = stubFrom({ data: [], error: null });
    await listProviderCatalog(PROVIDER_ID);
    expect(from).toHaveBeenCalledWith("provider_catalog_items");
    expect(calls.eq?.[0]).toEqual(["provider_id", PROVIDER_ID]);
    expect(calls.order?.[0]?.[0]).toBe("component_group");
    expect(calls.order?.[1]?.[0]).toBe("name");
  });

  it("returns an empty list when the owner has no items", async () => {
    stubFrom({ data: [], error: null });
    expect(await listProviderCatalog(PROVIDER_ID)).toEqual([]);
  });

  it("404s a non-owner via the ownership gate before reading the table", async () => {
    const { from } = stubFrom(
      { data: [], error: null },
      { data: false, error: null },
    );
    await expect(listProviderCatalog(PROVIDER_ID)).rejects.toBeInstanceOf(
      NotFoundError,
    );
    expect(from).not.toHaveBeenCalled();
  });

  it("404s a malformed provider id without an RPC round trip", async () => {
    const { rpc } = stubFrom({ data: [], error: null });
    await expect(listProviderCatalog("not-a-uuid")).rejects.toBeInstanceOf(
      NotFoundError,
    );
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe("createCatalogItem", () => {
  it("validates the body before touching the DB", async () => {
    const { from } = stubFrom({ data: null, error: null });
    await expect(
      createCatalogItem(PROVIDER_ID, { ...VALID_CREATE, defaultQuantity: 0 }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(from).not.toHaveBeenCalled();
  });

  it("inserts the validated values with the route provider_id and returns the DTO", async () => {
    const { calls } = stubFrom({ data: ROW, error: null });
    const result = await createCatalogItem(PROVIDER_ID, VALID_CREATE);
    expect(result).toEqual(DTO);
    expect(calls.insert?.[0]?.[0]).toMatchObject({
      provider_id: PROVIDER_ID,
      name: "Rajma",
      component_group: "dal_or_legume",
      default_quantity: 16,
    });
  });

  it("maps a 42501 RLS rejection (non-owner) to NotFound", async () => {
    stubFrom({ data: null, error: { code: "42501" } });
    await expect(
      createCatalogItem(PROVIDER_ID, VALID_CREATE),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("maps a 23503 FK violation on sourceDishId to ValidationError", async () => {
    stubFrom({ data: null, error: { code: "23503" } });
    await expect(
      createCatalogItem(PROVIDER_ID, VALID_CREATE),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("maps a 22003 numeric overflow to a defaultQuantity ValidationError", async () => {
    stubFrom({ data: null, error: { code: "22003" } });
    await expect(
      createCatalogItem(PROVIDER_ID, VALID_CREATE),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("attributes a 23514 CHECK to the violated constraint's field", async () => {
    stubFrom({
      data: null,
      error: {
        code: "23514",
        message:
          'new row for relation "provider_catalog_items" violates check constraint "provider_catalog_unit_not_blank"',
      },
    });
    await expect(
      createCatalogItem(PROVIDER_ID, VALID_CREATE),
    ).rejects.toMatchObject({
      details: [{ field: "canonicalUnit", rule: "required" }],
    });
  });

  it("404s a non-owner via the ownership gate before inserting", async () => {
    const { from } = stubFrom(
      { data: ROW, error: null },
      { data: false, error: null },
    );
    await expect(
      createCatalogItem(PROVIDER_ID, VALID_CREATE),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(from).not.toHaveBeenCalled();
  });
});

describe("updateCatalogItem", () => {
  it("reads back the current item on an empty patch (no write)", async () => {
    const { calls } = stubFrom({ data: ROW, error: null });
    const result = await updateCatalogItem(PROVIDER_ID, ITEM_ID, {});
    expect(result).toEqual(DTO);
    expect(calls.update).toBeUndefined();
  });

  it("archives by toggling is_active, scoped by item + provider", async () => {
    const { calls } = stubFrom({
      data: { ...ROW, is_active: false },
      error: null,
    });
    const result = await updateCatalogItem(PROVIDER_ID, ITEM_ID, {
      isActive: false,
    });
    expect(result.isActive).toBe(false);
    expect(calls.update?.[0]?.[0]).toEqual({ is_active: false });
    expect(calls.eq?.[0]).toEqual(["id", ITEM_ID]);
    expect(calls.eq?.[1]).toEqual(["provider_id", PROVIDER_ID]);
  });

  it("maps an absent row (not owner / not found) to NotFound", async () => {
    stubFrom({ data: null, error: null });
    await expect(
      updateCatalogItem(PROVIDER_ID, ITEM_ID, { name: "X" }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("rejects an invalid patch before touching the DB", async () => {
    const { from } = stubFrom({ data: null, error: null });
    await expect(
      updateCatalogItem(PROVIDER_ID, ITEM_ID, { defaultQuantity: -5 }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(from).not.toHaveBeenCalled();
  });

  it("404s a non-owner via the ownership gate before updating", async () => {
    const { from } = stubFrom(
      { data: ROW, error: null },
      { data: false, error: null },
    );
    await expect(
      updateCatalogItem(PROVIDER_ID, ITEM_ID, { name: "X" }),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(from).not.toHaveBeenCalled();
  });
});
