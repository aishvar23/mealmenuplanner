import { describe, expect, it, vi } from "vitest";

import { InternalError } from "@/lib/errors";

import type { PairedDishDto } from "./dto";

vi.mock("server-only", () => ({}));

import { attachPackages, resolvePackagesByDishId } from "./packaging";

interface Plan {
  pairings?: unknown;
  pairingsError?: unknown;
  dishes?: unknown;
  dishesError?: unknown;
}

/** Stub supporting `.from(t).select().eq().in()` awaited as a list query. */
function makeClient(plan: Plan) {
  const builder = (table: string) => {
    const result =
      table === "dish_pairings"
        ? { data: plan.pairings ?? [], error: plan.pairingsError ?? null }
        : table === "dishes"
          ? { data: plan.dishes ?? [], error: plan.dishesError ?? null }
          : { data: null, error: null };
    const b: Record<string, unknown> = {
      select: () => b,
      eq: () => b,
      in: () => b,
      then: (resolve: (v: unknown) => unknown) => resolve(result),
    };
    return b;
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { from: (table: string) => builder(table) } as any;
}

const RAJMA = {
  id: "rajma",
  name: "Rajma Masala",
  meal_role: "main_component",
};
const RICE = {
  id: "rice",
  name: "Steamed Rice",
  meal_role: "rice_component",
  serving_qty: 1,
  serving_unit: "cup",
  calories_kcal: 200,
  protein_g: 4,
  carbs_g: 44,
  fat_g: 0,
  glycemic_index: 73,
};

const RICE_NUTRITION = {
  servingQty: 1,
  servingUnit: "cup",
  calories: 200,
  proteinG: 4,
  carbsG: 44,
  fatG: 0,
  glycemicIndex: 73,
};
const BIRYANI = {
  id: "biryani",
  name: "Veg Biryani",
  meal_role: "complete_meal",
};

describe("resolvePackagesByDishId", () => {
  it("pairs a main_component with its rice base", async () => {
    const client = makeClient({
      pairings: [
        {
          primary_dish_id: "rajma",
          paired_dish_id: "rice",
          pairing_type: "rice_pairing",
        },
      ],
      dishes: [RAJMA, RICE],
    });

    const map = await resolvePackagesByDishId(client, ["rajma"]);
    expect(map.get("rajma")).toEqual([
      {
        dishId: "rice",
        dishName: "Steamed Rice",
        pairingType: "rice_pairing",
        nutrition: RICE_NUTRITION,
      },
    ]);
  });

  it("does not bolt a base onto a complete_meal", async () => {
    const client = makeClient({
      pairings: [
        {
          primary_dish_id: "biryani",
          paired_dish_id: "rice",
          pairing_type: "rice_pairing",
        },
      ],
      dishes: [BIRYANI, RICE],
    });

    const map = await resolvePackagesByDishId(client, ["biryani"]);
    expect(map.get("biryani")).toEqual([]);
  });

  it("skips a paired dish that is no longer active", async () => {
    const client = makeClient({
      pairings: [
        {
          primary_dish_id: "rajma",
          paired_dish_id: "rice",
          pairing_type: "rice_pairing",
        },
      ],
      // The paired "rice" row is absent from the active-dishes read.
      dishes: [RAJMA],
    });

    const map = await resolvePackagesByDishId(client, ["rajma"]);
    expect(map.get("rajma")).toEqual([]);
  });

  it("maps an unknown / inactive primary to an empty package", async () => {
    const client = makeClient({ pairings: [], dishes: [] });
    const map = await resolvePackagesByDishId(client, ["ghost"]);
    expect(map.get("ghost")).toEqual([]);
  });

  it("returns early without querying for an empty id list", async () => {
    const client = makeClient({});
    const fromSpy = vi.spyOn(client, "from");
    const map = await resolvePackagesByDishId(client, []);
    expect(map.size).toBe(0);
    expect(fromSpy).not.toHaveBeenCalled();
  });

  it("wraps a pairings query error as InternalError", async () => {
    const client = makeClient({ pairingsError: { message: "boom" } });
    await expect(
      resolvePackagesByDishId(client, ["rajma"]),
    ).rejects.toBeInstanceOf(InternalError);
  });

  it("wraps a dishes query error as InternalError", async () => {
    const client = makeClient({
      pairings: [],
      dishesError: { message: "boom" },
    });
    await expect(
      resolvePackagesByDishId(client, ["rajma"]),
    ).rejects.toBeInstanceOf(InternalError);
  });
});

describe("attachPackages", () => {
  it("populates pairedDishes on rows that have a dish", async () => {
    const client = makeClient({
      pairings: [
        {
          primary_dish_id: "rajma",
          paired_dish_id: "rice",
          pairing_type: "rice_pairing",
        },
      ],
      dishes: [RAJMA, RICE],
    });

    const rows: { dishId: string | null; pairedDishes: PairedDishDto[] }[] = [
      { dishId: "rajma", pairedDishes: [] },
    ];
    await attachPackages(client, rows);
    expect(rows[0]?.pairedDishes).toEqual([
      {
        dishId: "rice",
        dishName: "Steamed Rice",
        pairingType: "rice_pairing",
        nutrition: RICE_NUTRITION,
      },
    ]);
  });

  it("no-ops (no query) when no row has a dish", async () => {
    const client = makeClient({});
    const fromSpy = vi.spyOn(client, "from");
    const rows = [{ dishId: null, pairedDishes: [] as PairedDishDto[] }];
    await attachPackages(client, rows);
    expect(rows[0]?.pairedDishes).toEqual([]);
    expect(fromSpy).not.toHaveBeenCalled();
  });
});
