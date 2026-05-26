import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { ActionItemRow } from "./access";
import { safeProposeCombination } from "./propose-combination";

interface TableResult {
  data?: unknown;
  error?: unknown;
}

/**
 * A minimal supabase stub covering the reads + the `propose_meal_combination`
 * RPC the promotion hook makes. Each table read is `.select().eq()...` (awaited or
 * `.maybeSingle()`); `rpc` records its args so the test can assert the payload.
 */
function makeClient(
  opts: {
    accompaniments?: TableResult;
    preferences?: TableResult;
    dish?: TableResult;
    rpc?: TableResult;
  } = {},
) {
  const rpcCalls: { name: string; args: Record<string, unknown> }[] = [];
  const results: Record<string, TableResult> = {
    household_dish_accompaniments: opts.accompaniments ?? {
      data: [],
      error: null,
    },
    household_preferences: opts.preferences ?? {
      data: { diet_type: "vegetarian" },
      error: null,
    },
    dishes: opts.dish ?? { data: { cuisine: "North Indian" }, error: null },
  };

  function builder(table: string) {
    const result = Promise.resolve(
      results[table] ?? { data: null, error: null },
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const b: any = {
      select: () => b,
      eq: () => b,
      maybeSingle: () => result,
      then: (onF: (v: TableResult) => unknown, onR: (e: unknown) => unknown) =>
        result.then(onF, onR),
    };
    return b;
  }

  const client = {
    from: (table: string) => builder(table),
    rpc: (name: string, args: Record<string, unknown>) => {
      rpcCalls.push({ name, args });
      return Promise.resolve(opts.rpc ?? { error: null });
    },
  };
  return { client, rpcCalls };
}

function makeItem(overrides: Partial<ActionItemRow> = {}): ActionItemRow {
  return {
    id: "item-1",
    household_id: "hh-1",
    meal_plan_id: "plan-1",
    date: "2026-05-25",
    meal_slot: "dinner",
    dish_id: "dish-main",
    status: "accepted",
    locked: false,
    reason: null,
    changed_by_user_id: null,
    dishes: {
      name: "Rajma Masala",
      image_url: null,
      image_alt_text: null,
      image_status: "placeholder",
    },
    ...overrides,
  } as ActionItemRow;
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("safeProposeCombination", () => {
  it("proposes the main + accompaniments as a combination", async () => {
    const { client, rpcCalls } = makeClient({
      accompaniments: {
        data: [
          { accompaniment_dish_id: "acc-rice" },
          { accompaniment_dish_id: "acc-roti" },
        ],
        error: null,
      },
    });

    await safeProposeCombination(client as never, makeItem());

    expect(rpcCalls).toHaveLength(1);
    expect(rpcCalls[0]?.name).toBe("propose_meal_combination");
    expect(rpcCalls[0]?.args).toEqual({
      p_household_id: "hh-1",
      p_name: "Rajma Masala plate",
      p_diet_type: "vegetarian",
      p_dish_ids: ["dish-main", "acc-rice", "acc-roti"],
      p_cuisine: "North Indian",
    });
  });

  it("omits p_cuisine when the main dish has none", async () => {
    const { client, rpcCalls } = makeClient({
      accompaniments: {
        data: [{ accompaniment_dish_id: "acc-1" }],
        error: null,
      },
      dish: { data: { cuisine: null }, error: null },
    });

    await safeProposeCombination(client as never, makeItem());

    expect(rpcCalls[0]?.args).not.toHaveProperty("p_cuisine");
  });

  it("does nothing when the dish has no configured accompaniments", async () => {
    const { client, rpcCalls } = makeClient({
      accompaniments: { data: [], error: null },
    });
    await safeProposeCombination(client as never, makeItem());
    expect(rpcCalls).toHaveLength(0);
  });

  it("does nothing when the household has no preferences row", async () => {
    const { client, rpcCalls } = makeClient({
      accompaniments: {
        data: [{ accompaniment_dish_id: "acc-1" }],
        error: null,
      },
      preferences: { data: null, error: null },
    });
    await safeProposeCombination(client as never, makeItem());
    expect(rpcCalls).toHaveLength(0);
  });

  it("does nothing when the item has no dish", async () => {
    const { client, rpcCalls } = makeClient({
      accompaniments: {
        data: [{ accompaniment_dish_id: "acc-1" }],
        error: null,
      },
    });
    await safeProposeCombination(client as never, makeItem({ dish_id: null }));
    expect(rpcCalls).toHaveLength(0);
  });

  it("swallows a read error (best-effort) and never throws", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { client, rpcCalls } = makeClient({
      accompaniments: { data: null, error: { message: "boom" } },
    });

    await expect(
      safeProposeCombination(client as never, makeItem()),
    ).resolves.toBeUndefined();
    expect(rpcCalls).toHaveLength(0);
    expect(spy).toHaveBeenCalled();
  });

  it("swallows an RPC error (best-effort) and never throws", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { client } = makeClient({
      accompaniments: {
        data: [{ accompaniment_dish_id: "acc-1" }],
        error: null,
      },
      rpc: { error: { message: "denied" } },
    });

    await expect(
      safeProposeCombination(client as never, makeItem()),
    ).resolves.toBeUndefined();
    expect(spy).toHaveBeenCalled();
  });
});
