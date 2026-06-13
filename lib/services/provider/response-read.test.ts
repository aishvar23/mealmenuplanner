import { beforeEach, describe, expect, it, vi } from "vitest";

import { requireAuthUser } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/db/server";
import {
  InternalError,
  NotFoundError,
  UnauthenticatedError,
} from "@/lib/errors";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/server", () => ({ createServerSupabaseClient: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireAuthUser: vi.fn() }));

import { getMyResponse } from "./response-read";

const MENU_DAY_ID = "44444444-4444-4444-4444-444444444444";
const USER_ID = "11111111-1111-1111-1111-111111111111";

/** A full response row as PostgREST returns it (numeric as string). */
const FULL_ROW = {
  id: "99999999-9999-9999-9999-999999999999",
  status: "confirmed",
  version: 3,
  member_note: "no onions",
  locked_at: null,
  items: [
    {
      menu_component_id: "c1",
      selected_catalog_item_id: "item-rajma",
      quantity: "16",
      canonical_unit: "oz",
      spice_level: "regular",
      salt_level: null,
      customizations: [
        { customization_option_id: "o1", quantity: "2" },
        { customization_option_id: "o2", quantity: null },
      ],
    },
  ],
};

/**
 * A chainable Supabase query mock: builder methods record their args and return
 * the chain; `maybeSingle` resolves to the configured result.
 */
function makeChain(
  result: { data: unknown; error: unknown },
  calls: Record<string, unknown[][]>,
) {
  const chain: Record<string, unknown> = {};
  for (const m of ["select", "eq"]) {
    chain[m] = (...args: unknown[]) => {
      (calls[m] ??= []).push(args);
      return chain;
    };
  }
  chain.maybeSingle = () => Promise.resolve(result);
  return chain;
}

function stub(byTable: Record<string, { data: unknown; error: unknown }>) {
  const calls: Record<string, Record<string, unknown[][]>> = {};
  const from = vi.fn((table: string) => {
    const tableCalls = (calls[table] ??= {});
    return makeChain(byTable[table] ?? { data: null, error: null }, tableCalls);
  });
  vi.mocked(createServerSupabaseClient).mockResolvedValue({ from } as never);
  return { from, calls };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireAuthUser).mockResolvedValue({ id: USER_ID } as never);
});

describe("getMyResponse", () => {
  it("maps the nested row to a DTO and coerces numerics (string → number, null preserved)", async () => {
    stub({ provider_member_responses: { data: FULL_ROW, error: null } });

    const dto = await getMyResponse(MENU_DAY_ID);

    expect(dto.responseId).toBe(FULL_ROW.id);
    expect(dto.menuDayId).toBe(MENU_DAY_ID);
    expect(dto.status).toBe("confirmed");
    expect(dto.version).toBe(3);
    expect(dto.memberNote).toBe("no onions");
    expect(dto.lockedAt).toBeNull();
    expect(dto.items).toHaveLength(1);
    const item = dto.items[0]!;
    expect(item.menuComponentId).toBe("c1");
    expect(item.selectedCatalogItemId).toBe("item-rajma");
    expect(item.quantity).toBe(16); // numeric string coerced
    expect(item.canonicalUnit).toBe("oz");
    expect(item.spiceLevel).toBe("regular");
    expect(item.saltLevel).toBeNull();
    // Increment quantity coerced; single/boolean (null) preserved as null.
    expect(item.customizations).toEqual([
      { customizationOptionId: "o1", quantity: 2 },
      { customizationOptionId: "o2", quantity: null },
    ]);
  });

  it("self-scopes the query to the caller's own response for the day", async () => {
    const { from, calls } = stub({
      provider_member_responses: { data: FULL_ROW, error: null },
    });

    await getMyResponse(MENU_DAY_ID);

    expect(from).toHaveBeenCalledWith("provider_member_responses");
    expect(calls.provider_member_responses?.eq?.[0]).toEqual([
      "menu_day_id",
      MENU_DAY_ID,
    ]);
    expect(calls.provider_member_responses?.eq?.[1]).toEqual([
      "member_user_id",
      USER_ID,
    ]);
  });

  it("returns the empty 'no response yet' shape when the caller has not responded", async () => {
    stub({ provider_member_responses: { data: null, error: null } });

    const dto = await getMyResponse(MENU_DAY_ID);

    expect(dto).toEqual({
      responseId: null,
      menuDayId: MENU_DAY_ID,
      status: "no_response",
      version: 0,
      memberNote: null,
      items: [],
      lockedAt: null,
    });
  });

  it("treats a row with no items as an empty item list, not undefined", async () => {
    stub({
      provider_member_responses: {
        data: { ...FULL_ROW, items: null },
        error: null,
      },
    });

    const dto = await getMyResponse(MENU_DAY_ID);

    expect(dto.responseId).toBe(FULL_ROW.id);
    expect(dto.items).toEqual([]);
  });

  it("404s a malformed id without a DB round trip", async () => {
    const { from } = stub({});
    await expect(getMyResponse("not-a-uuid")).rejects.toBeInstanceOf(
      NotFoundError,
    );
    expect(from).not.toHaveBeenCalled();
  });

  it("surfaces a DB error as InternalError", async () => {
    stub({
      provider_member_responses: { data: null, error: { code: "XX000" } },
    });
    await expect(getMyResponse(MENU_DAY_ID)).rejects.toBeInstanceOf(
      InternalError,
    );
  });

  it("maps an auth error (28000) to UnauthenticatedError, not Internal", async () => {
    stub({
      provider_member_responses: { data: null, error: { code: "28000" } },
    });
    await expect(getMyResponse(MENU_DAY_ID)).rejects.toBeInstanceOf(
      UnauthenticatedError,
    );
  });
});
