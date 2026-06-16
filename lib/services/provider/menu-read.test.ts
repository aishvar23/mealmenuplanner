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

import { getMenuDay, getTodayMenu, getWeeklyMenu } from "./menu-read";

const PROVIDER_ID = "22222222-2222-2222-2222-222222222222";
const MENU_DAY_ID = "44444444-4444-4444-4444-444444444444";

/** A full nested menu-day row as PostgREST returns it (numeric as string). */
const FULL_ROW = {
  id: MENU_DAY_ID,
  provider_id: PROVIDER_ID,
  weekly_menu_id: "55555555-5555-5555-5555-555555555555",
  menu_date: "2026-06-13",
  cutoff_at: "2026-06-13T03:30:00Z",
  status: "published",
  note: null,
  published_at: "2026-06-12T10:00:00Z",
  locked_at: null,
  revision: 1,
  supersedes_menu_day_id: null,
  superseded_at: null,
  components: [
    {
      id: "c2",
      component_group: "rice",
      default_catalog_item_id: "item-rice",
      default_item_name: "Jeera Rice",
      default_quantity: "8",
      canonical_unit: "oz",
      is_required: true,
      supports_spice_level: false,
      supports_salt_level: false,
      sort_order: 1,
      alternatives: [],
      customization_groups: [],
    },
    {
      id: "c1",
      component_group: "dal_or_legume",
      default_catalog_item_id: "item-dal",
      default_item_name: "Rajma",
      default_quantity: "16",
      canonical_unit: "oz",
      is_required: true,
      supports_spice_level: true,
      supports_salt_level: true,
      sort_order: 0,
      alternatives: [
        {
          id: "alt-active",
          catalog_item_id: "item-rajma",
          item_name: "Rajma Alt",
          quantity: "16",
          canonical_unit: "oz",
          is_active: true,
        },
        {
          id: "alt-archived",
          catalog_item_id: "item-old",
          item_name: "Old Item",
          quantity: "16",
          canonical_unit: "oz",
          is_active: false,
        },
      ],
      customization_groups: [
        {
          id: "g1",
          name: "Extra roti",
          customization_type: "quantity_increment",
          included_in_price: false,
          is_required: false,
          minimum_selections: 0,
          maximum_selections: 4,
          sort_order: 0,
          options: [
            {
              id: "o2",
              code: "two",
              label: "Two",
              quantity_delta: "2",
              canonical_unit: "piece",
              external_price_label: "+$2",
              minimum_quantity: "0",
              maximum_quantity: "4",
              is_active: true,
              sort_order: 1,
            },
            {
              id: "o-inactive",
              code: "gone",
              label: "Gone",
              quantity_delta: "1",
              canonical_unit: "piece",
              external_price_label: null,
              minimum_quantity: null,
              maximum_quantity: null,
              is_active: false,
              sort_order: 2,
            },
            {
              id: "o1",
              code: "one",
              label: "One",
              quantity_delta: "1",
              canonical_unit: "piece",
              external_price_label: "+$1",
              minimum_quantity: null,
              maximum_quantity: null,
              is_active: true,
              sort_order: 0,
            },
          ],
        },
      ],
    },
  ],
};

/**
 * A chainable Supabase query mock per table: builder methods record their args
 * and return the chain; `maybeSingle` and awaiting the chain both resolve to the
 * table's configured result. `byTable` maps a table name to its `{ data, error }`.
 */
function makeChain(
  result: { data: unknown; error: unknown },
  calls: Record<string, unknown[][]>,
) {
  const chain: Record<string, unknown> = {};
  for (const m of ["select", "eq", "order", "limit", "gte", "lte", "is"]) {
    chain[m] = (...args: unknown[]) => {
      (calls[m] ??= []).push(args);
      return chain;
    };
  }
  chain.maybeSingle = () => Promise.resolve(result);
  chain.then = (onF: (v: unknown) => unknown) =>
    Promise.resolve(result).then(onF);
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

const ORG_OK = { data: { timezone: "UTC" }, error: null };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireAuthUser).mockResolvedValue({ id: "user-1" } as never);
});

describe("getMenuDay", () => {
  it("maps the nested row to a DTO: sorts components/groups/options, filters inactive, coerces numerics", async () => {
    stub({ provider_menu_days: { data: FULL_ROW, error: null } });

    const dto = await getMenuDay(MENU_DAY_ID);

    expect(dto.menuDayId).toBe(MENU_DAY_ID);
    expect(dto.providerId).toBe(PROVIDER_ID);
    expect(dto.weeklyMenuId).toBe("55555555-5555-5555-5555-555555555555");
    expect(dto.status).toBe("published");
    // Components are sorted by sort_order (c1 before c2).
    expect(dto.components.map((c) => c.menuComponentId)).toEqual(["c1", "c2"]);
    const dal = dto.components[0]!;
    expect(dal.defaultQuantity).toBe(16); // numeric string coerced
    expect(dal.supportsSpiceLevel).toBe(true);
    // Denormalized dish name surfaced on the component (ADO #39).
    expect(dal.defaultItemName).toBe("Rajma");
    // Archived alternative dropped; active one mapped + numeric coerced.
    expect(dal.alternatives).toEqual([
      {
        alternativeId: "alt-active",
        catalogItemId: "item-rajma",
        itemName: "Rajma Alt",
        quantity: 16,
        canonicalUnit: "oz",
      },
    ]);
    // Inactive option dropped; remaining options sorted (o1 before o2).
    const group = dal.customizationGroups[0]!;
    expect(group.maximumSelections).toBe(4);
    expect(group.options.map((o) => o.optionId)).toEqual(["o1", "o2"]);
    expect(group.options[1]).toEqual({
      optionId: "o2",
      code: "two",
      label: "Two",
      quantityDelta: 2,
      canonicalUnit: "piece",
      externalPriceLabel: "+$2",
      minimumQuantity: 0,
      maximumQuantity: 4,
    });
    // A component with no children yields empty arrays, not undefined.
    expect(dto.components[1]!.alternatives).toEqual([]);
    expect(dto.components[1]!.customizationGroups).toEqual([]);
  });

  it("queries provider_menu_days by id", async () => {
    const { from, calls } = stub({
      provider_menu_days: { data: FULL_ROW, error: null },
    });

    await getMenuDay(MENU_DAY_ID);

    expect(from).toHaveBeenCalledWith("provider_menu_days");
    expect(calls.provider_menu_days?.eq?.[0]).toEqual(["id", MENU_DAY_ID]);
  });

  it("404s a malformed id without a DB round trip", async () => {
    const { from } = stub({});
    await expect(getMenuDay("not-a-uuid")).rejects.toBeInstanceOf(
      NotFoundError,
    );
    expect(from).not.toHaveBeenCalled();
  });

  it("404s when RLS hides the day (maybeSingle null)", async () => {
    stub({ provider_menu_days: { data: null, error: null } });
    await expect(getMenuDay(MENU_DAY_ID)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("surfaces a DB error as InternalError", async () => {
    stub({
      provider_menu_days: { data: null, error: { code: "XX000" } },
    });
    await expect(getMenuDay(MENU_DAY_ID)).rejects.toBeInstanceOf(InternalError);
  });

  it("maps an auth error (28000) to UnauthenticatedError, not Internal", async () => {
    stub({
      provider_menu_days: { data: null, error: { code: "28000" } },
    });
    await expect(getMenuDay(MENU_DAY_ID)).rejects.toBeInstanceOf(
      UnauthenticatedError,
    );
  });
});

describe("getTodayMenu", () => {
  it("resolves the provider tz, queries today's date, and returns the DTO", async () => {
    const { from, calls } = stub({
      provider_organizations: ORG_OK,
      provider_menu_days: { data: FULL_ROW, error: null },
    });

    const dto = await getTodayMenu(PROVIDER_ID);

    expect(dto?.menuDayId).toBe(MENU_DAY_ID);
    expect(from).toHaveBeenCalledWith("provider_organizations");
    expect(from).toHaveBeenCalledWith("provider_menu_days");
    expect(calls.provider_menu_days?.eq?.[0]).toEqual([
      "provider_id",
      PROVIDER_ID,
    ]);
    // The menu_date filter is a concrete YYYY-MM-DD (today in the provider tz).
    const dateArg = calls.provider_menu_days?.eq?.[1];
    expect(dateArg?.[0]).toBe("menu_date");
    expect(dateArg?.[1]).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    // Most-recently-published wins (DESC, nulls last), then a stable
    // created_at-DESC → id-ASC tiebreaker so duplicate-date drafts resolve
    // deterministically; single row.
    expect(calls.provider_menu_days?.order?.[0]).toEqual([
      "published_at",
      { ascending: false, nullsFirst: false },
    ]);
    expect(calls.provider_menu_days?.order?.[1]).toEqual([
      "created_at",
      { ascending: false },
    ]);
    expect(calls.provider_menu_days?.order?.[2]).toEqual([
      "id",
      { ascending: true },
    ]);
    expect(calls.provider_menu_days?.limit?.[0]).toEqual([1]);
  });

  it("returns null when no day is published today / caller not yet approved", async () => {
    stub({
      provider_organizations: ORG_OK,
      provider_menu_days: { data: null, error: null },
    });
    expect(await getTodayMenu(PROVIDER_ID)).toBeNull();
  });

  it("404s an unknown provider (no readable org row)", async () => {
    stub({
      provider_organizations: { data: null, error: null },
      provider_menu_days: { data: FULL_ROW, error: null },
    });
    await expect(getTodayMenu(PROVIDER_ID)).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it("404s a malformed provider id without a DB round trip", async () => {
    const { from } = stub({});
    await expect(getTodayMenu("nope")).rejects.toBeInstanceOf(NotFoundError);
    expect(from).not.toHaveBeenCalled();
  });

  it("maps an auth error (28000) on the tz lookup to UnauthenticatedError", async () => {
    stub({
      provider_organizations: { data: null, error: { code: "28000" } },
    });
    await expect(getTodayMenu(PROVIDER_ID)).rejects.toBeInstanceOf(
      UnauthenticatedError,
    );
  });

  it("surfaces a non-auth tz-lookup DB error as InternalError", async () => {
    stub({
      provider_organizations: { data: null, error: { code: "XX000" } },
    });
    await expect(getTodayMenu(PROVIDER_ID)).rejects.toBeInstanceOf(
      InternalError,
    );
  });
});

describe("getWeeklyMenu", () => {
  it("queries the [today, today+6] window ordered by date and maps the list", async () => {
    const { calls } = stub({
      provider_organizations: ORG_OK,
      provider_menu_days: { data: [FULL_ROW], error: null },
    });

    const list = await getWeeklyMenu(PROVIDER_ID);

    expect(list).toHaveLength(1);
    expect(list[0]!.menuDayId).toBe(MENU_DAY_ID);
    const gte = calls.provider_menu_days?.gte?.[0];
    const lte = calls.provider_menu_days?.lte?.[0];
    expect(gte?.[0]).toBe("menu_date");
    expect(lte?.[0]).toBe("menu_date");
    // The window spans exactly 6 days (inclusive 7-day week).
    const start = new Date(`${gte?.[1]}T00:00:00Z`).getTime();
    const end = new Date(`${lte?.[1]}T00:00:00Z`).getTime();
    expect((end - start) / 86_400_000).toBe(6);
    expect(calls.provider_menu_days?.order?.[0]).toEqual([
      "menu_date",
      { ascending: true },
    ]);
  });

  it("returns an empty array when the week has no readable days", async () => {
    stub({
      provider_organizations: ORG_OK,
      provider_menu_days: { data: [], error: null },
    });
    expect(await getWeeklyMenu(PROVIDER_ID)).toEqual([]);
  });
});
