import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth", () => ({ requireAuthUser: vi.fn() }));
vi.mock("@/lib/db/server", () => ({ createServerSupabaseClient: vi.fn() }));
vi.mock("@/lib/services/grocery", () => ({
  safeRegenerateGroceryListForPlan: vi.fn(),
}));
vi.mock("./access", () => ({
  requireHouseholdPermission: vi.fn(),
  ITEM_ACTION_SELECT: "id",
}));
vi.mock("./plans", () => ({
  resolveOrCreateDayPlan: vi.fn(),
  resolveOrCreateRangePlan: vi.fn(),
}));
vi.mock("./suggest", () => ({
  suggestForSlot: vi.fn(),
  toAlternatives: (
    recs: { dishId: string; score: number; reason: string }[],
    nameById: Map<string, string>,
    imageById: Map<
      string,
      {
        imageUrl: string | null;
        imageAltText: string | null;
        imageStatus: string;
      }
    > = new Map(),
    nutritionById: Map<string, unknown> = new Map(),
    flagsById: Map<
      string,
      { weightLoss: boolean; highProtein: boolean }
    > = new Map(),
  ) =>
    recs.map((r) => ({
      dishId: r.dishId,
      dishName: nameById.get(r.dishId) ?? null,
      dishImageUrl: imageById.get(r.dishId)?.imageUrl ?? null,
      dishImageAltText: imageById.get(r.dishId)?.imageAltText ?? null,
      dishImageStatus: imageById.get(r.dishId)?.imageStatus ?? null,
      nutrition: nutritionById.get(r.dishId) ?? null,
      weightLoss: flagsById.get(r.dishId)?.weightLoss ?? false,
      highProtein: flagsById.get(r.dishId)?.highProtein ?? false,
      score: r.score,
      reason: r.reason,
    })),
}));
vi.mock("@/lib/recommendation", () => ({
  // Pick the first surviving candidate so the chosenThisRun exclusion is observable.
  recommendSlot: (input: { dishes: { id: string }[] }) =>
    input.dishes[0]
      ? [
          {
            dishId: input.dishes[0].id,
            score: 1,
            reason: "r",
            missingConstraints: [],
            prepTasks: [],
            pairedDishes: [],
          },
        ]
      : [],
  // Combinations off here so generateWeek skips the popular-combo load; the
  // mocked recommendSlot ignores config anyway (P10 engine behaviour is unit-
  // tested in lib/recommendation/scoring.test.ts).
  RECOMMENDATION_CONFIG: {
    combinations: { enabled: false, popularityThreshold: 5 },
  },
}));
vi.mock("@/lib/services/recommendation", () => ({
  loadHouseholdContext: vi.fn(),
  loadActiveMembers: vi.fn(),
  loadCandidateDishes: vi.fn(),
  loadMealHistory: vi.fn(),
  loadPopularCombinationDishIds: vi.fn(),
}));

import { requireAuthUser } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/db/server";
import {
  loadActiveMembers,
  loadCandidateDishes,
  loadHouseholdContext,
  loadMealHistory,
} from "@/lib/services/recommendation";

import { safeRegenerateGroceryListForPlan } from "@/lib/services/grocery";

import { resolveOrCreateDayPlan, resolveOrCreateRangePlan } from "./plans";
import { suggestForSlot } from "./suggest";
import { ensureDaySuggestions, generateToday, generateWeek } from "./generate";

const HH = "hh-1";

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: "i1",
    meal_plan_id: "plan-1",
    household_id: HH,
    date: "2026-05-25",
    meal_slot: "dinner",
    dish_id: "d1",
    status: "suggested",
    locked: false,
    reason: "r",
    changed_by_user_id: null,
    dishes: { name: "Dish" },
    ...overrides,
  };
}

/** Stateful client for the today path: select (loadCell) + insert (insertCell). */
function todayClient(opts: { cell?: unknown; inserted?: unknown }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function builder(mode: "select" | "insert"): any {
    const b = {
      select: () => b,
      eq: () => b,
      // `attachPackages` issues `.in(...)` list queries against dish_pairings /
      // dishes; resolve them empty so generation needs no extra fixtures.
      in: () => b,
      insert: () => builder("insert"),
      maybeSingle: () =>
        Promise.resolve(
          mode === "insert"
            ? { data: opts.inserted ?? null, error: null }
            : { data: opts.cell ?? null, error: null },
        ),
      then: (resolve: (v: unknown) => unknown) =>
        resolve({ data: [], error: null }),
    };
    return b;
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { from: () => builder("select") } as any;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireAuthUser).mockResolvedValue({ id: "user-1" } as never);
  vi.mocked(resolveOrCreateDayPlan).mockResolvedValue({
    id: "plan-1",
    status: "active",
    start_date: "2026-05-25",
    end_date: "2026-05-25",
  });
});

describe("generateToday", () => {
  it("returns a locked cell unchanged without re-suggesting", async () => {
    vi.mocked(createServerSupabaseClient).mockResolvedValue(
      todayClient({ cell: row({ locked: true }) }),
    );
    const result = await generateToday(HH, "2026-05-25", "dinner");
    expect(result.mealPlanItem?.locked).toBe(true);
    expect(suggestForSlot).not.toHaveBeenCalled();
  });

  it("does not overwrite an eating-out slot", async () => {
    vi.mocked(createServerSupabaseClient).mockResolvedValue(
      todayClient({ cell: row({ status: "eating_out", dish_id: null }) }),
    );
    const result = await generateToday(HH, "2026-05-25", "dinner");
    expect(result.mealPlanItem?.status).toBe("eating_out");
    expect(suggestForSlot).not.toHaveBeenCalled();
  });

  it("returns no item when nothing passes the hard filters", async () => {
    vi.mocked(createServerSupabaseClient).mockResolvedValue(
      todayClient({ cell: null }),
    );
    vi.mocked(suggestForSlot).mockResolvedValue({
      recommendations: [],
      nameById: new Map(),
      imageById: new Map(),
      nutritionById: new Map(),
      flagsById: new Map(),
    });
    const result = await generateToday(HH, "2026-05-25", "dinner");
    expect(result.mealPlanItem).toBeNull();
  });

  it("persists the top pick and returns alternatives", async () => {
    vi.mocked(createServerSupabaseClient).mockResolvedValue(
      todayClient({
        cell: null,
        inserted: row({ dish_id: "top", dishes: { name: "Top Dish" } }),
      }),
    );
    vi.mocked(suggestForSlot).mockResolvedValue({
      recommendations: [
        {
          dishId: "top",
          score: 9,
          reason: "best",
          missingConstraints: [],
          prepTasks: [],
          pairedDishes: [],
        },
        {
          dishId: "alt",
          score: 5,
          reason: "ok",
          missingConstraints: [],
          prepTasks: [],
          pairedDishes: [],
        },
      ],
      nameById: new Map([
        ["top", "Top Dish"],
        ["alt", "Alt Dish"],
      ]),
      imageById: new Map([
        [
          "top",
          {
            imageUrl: "/images/top.jpg",
            imageAltText: "Top Dish plated",
            imageStatus: "verified",
          },
        ],
        [
          "alt",
          {
            imageUrl: "/images/alt.jpg",
            imageAltText: "Alt Dish plated",
            imageStatus: "verified",
          },
        ],
      ]),
      nutritionById: new Map(),
      flagsById: new Map(),
    });

    const result = await generateToday(HH, "2026-05-25", "dinner");

    expect(result.mealPlanItem?.dishName).toBe("Top Dish");
    expect(result.mealPlanItem?.dishImageUrl).toBe("/images/top.jpg");
    expect(result.alternatives).toEqual([
      {
        dishId: "alt",
        dishName: "Alt Dish",
        dishImageUrl: "/images/alt.jpg",
        dishImageAltText: "Alt Dish plated",
        dishImageStatus: "verified",
        nutrition: null,
        weightLoss: false,
        highProtein: false,
        score: 5,
        reason: "ok",
        pairedDishes: [],
      },
    ]);
  });

  it("recovers from a concurrent cell-insert race (23505) by updating the raced row", async () => {
    // loadCell empty → insertCell hits unique(meal_plan_id,date,meal_slot) →
    // re-read finds the winner row → updateCell (last-write-wins). No 500.
    const results = [
      { data: null, error: null }, // loadCell: cell empty
      { data: null, error: { code: "23505" } }, // insertCell: unique violation
      { data: row({ id: "raced-1", dish_id: "old" }), error: null }, // re-read winner
      {
        data: row({
          id: "raced-1",
          dish_id: "top",
          dishes: { name: "Top Dish" },
        }),
        error: null,
      }, // updateCell result
    ];
    let i = 0;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const b: any = {
      select: () => b,
      eq: () => b,
      in: () => b,
      insert: () => b,
      update: () => b,
      maybeSingle: () =>
        Promise.resolve(results[i++] ?? { data: null, error: null }),
      then: (resolve: (v: unknown) => unknown) =>
        resolve({ data: [], error: null }),
    };
    vi.mocked(createServerSupabaseClient).mockResolvedValue({
      from: () => b,
    } as never);
    vi.mocked(suggestForSlot).mockResolvedValue({
      recommendations: [
        {
          dishId: "top",
          score: 9,
          reason: "best",
          missingConstraints: [],
          prepTasks: [],
          pairedDishes: [],
        },
      ],
      nameById: new Map([["top", "Top Dish"]]),
      imageById: new Map(),
      nutritionById: new Map(),
      flagsById: new Map(),
    });

    const result = await generateToday(HH, "2026-05-25", "dinner");

    expect(result.mealPlanItem?.dishName).toBe("Top Dish");
    expect(i).toBe(4); // proves the re-read + update path actually ran
  });
});

/** Stateful client for the week path: prefs select, plan-cells select, upsert, count. */
function weekClient(opts: {
  mealsToPlan: string[];
  planCells: unknown[];
  count: number;
}) {
  const upserted: unknown[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const client: any = {
    from: (table: string) => {
      if (table === "household_preferences") {
        const b = {
          select: () => b,
          eq: () => b,
          maybeSingle: () =>
            Promise.resolve({
              data: { meals_to_plan: opts.mealsToPlan },
              error: null,
            }),
        };
        return b;
      }
      // meal_plan_items
      let isCount = false;
      const b = {
        select: (_cols?: string, options?: { head?: boolean }) => {
          isCount = options?.head === true;
          return b;
        },
        eq: () => b,
        upsert: (rows: unknown[]) => {
          upserted.push(...rows);
          return Promise.resolve({ error: null });
        },
        then: (resolve: (v: unknown) => unknown) =>
          resolve(
            isCount
              ? { count: opts.count, error: null }
              : { data: opts.planCells, error: null },
          ),
      };
      return b;
    },
  };
  return { client, upserted };
}

describe("generateWeek", () => {
  beforeEach(() => {
    vi.mocked(loadHouseholdContext).mockResolvedValue({
      dietTypes: ["vegetarian"],
      preferredCuisines: [],
      weekdayCookingTimeMinutes: null,
      weekendCookingTimeMinutes: null,
      varietyGapDays: 7,
      kidsCount: 0,
      dishFrequencies: new Map(),
      dishSuitableSlots: new Map(),
      chosenDishIds: new Set(),
    });
    vi.mocked(loadActiveMembers).mockResolvedValue([]);
    vi.mocked(loadMealHistory).mockResolvedValue({
      recentlyCookedDishIds: new Set(),
      recentlyRejectedDishIds: new Set(),
      doNotSuggestAgainDishIds: new Set(),
    });
    vi.mocked(loadCandidateDishes).mockResolvedValue([
      { id: "d1" } as never,
      { id: "d2" } as never,
    ]);
    vi.mocked(resolveOrCreateRangePlan).mockResolvedValue({
      id: "plan-1",
      status: "active",
      start_date: "2026-05-25",
      end_date: "2026-05-26",
    });
  });

  it("skips locked & eating-out cells and excludes dishes already chosen this run", async () => {
    // Day 1 dinner is locked (skip); day 2 dinner is open.
    const stub = weekClient({
      mealsToPlan: ["dinner"],
      planCells: [
        {
          date: "2026-05-25",
          meal_slot: "dinner",
          dish_id: "dX",
          status: "suggested",
          locked: true,
        },
      ],
      count: 1,
    });
    vi.mocked(createServerSupabaseClient).mockResolvedValue(stub.client);

    const result = await generateWeek(HH, "2026-05-25", "2026-05-26");

    // Only day 2 was written (day 1 was locked).
    expect(stub.upserted).toHaveLength(1);
    expect(stub.upserted[0]).toMatchObject({
      date: "2026-05-26",
      dish_id: "d1",
    });
    expect(result.itemCount).toBe(1);
  });

  it("gives different days different dishes via the chosenThisRun exclusion", async () => {
    const stub = weekClient({
      mealsToPlan: ["dinner"],
      planCells: [],
      count: 2,
    });
    vi.mocked(createServerSupabaseClient).mockResolvedValue(stub.client);

    await generateWeek(HH, "2026-05-25", "2026-05-26");

    const dishes = stub.upserted.map((r) => (r as { dish_id: string }).dish_id);
    expect(dishes).toEqual(["d1", "d2"]);
  });
});

/** Stateful client for the day pre-fill path: day-cells select + bulk upsert. */
function dayClient(dayCells: unknown[]) {
  const upserted: unknown[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const client: any = {
    from: () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const b: any = {
        select: () => b,
        eq: () => b,
        upsert: (rows: unknown[]) => {
          upserted.push(...rows);
          return Promise.resolve({ error: null });
        },
        then: (resolve: (v: unknown) => unknown) =>
          resolve({ data: dayCells, error: null }),
      };
      return b;
    },
  };
  return { client, upserted };
}

describe("ensureDaySuggestions", () => {
  beforeEach(() => {
    vi.mocked(loadHouseholdContext).mockResolvedValue({
      dietTypes: ["vegetarian"],
      preferredCuisines: [],
      weekdayCookingTimeMinutes: null,
      weekendCookingTimeMinutes: null,
      varietyGapDays: 7,
      kidsCount: 0,
      dishFrequencies: new Map(),
      dishSuitableSlots: new Map(),
      chosenDishIds: new Set(),
    });
    vi.mocked(loadActiveMembers).mockResolvedValue([]);
    vi.mocked(loadMealHistory).mockResolvedValue({
      recentlyCookedDishIds: new Set(),
      recentlyRejectedDishIds: new Set(),
      doNotSuggestAgainDishIds: new Set(),
    });
  });

  it("fills every empty slot with the engine's top pick and refreshes grocery once", async () => {
    const stub = dayClient([]);
    vi.mocked(createServerSupabaseClient).mockResolvedValue(stub.client);
    // Candidate dishes are loaded per slot, in slot order (breakfast, dinner).
    vi.mocked(loadCandidateDishes)
      .mockResolvedValueOnce([{ id: "b1" } as never])
      .mockResolvedValueOnce([{ id: "d1" } as never]);

    await ensureDaySuggestions(HH, "2026-05-25", ["breakfast", "dinner"]);

    expect(stub.upserted).toEqual([
      expect.objectContaining({
        meal_slot: "breakfast",
        dish_id: "b1",
        status: "suggested",
      }),
      expect.objectContaining({
        meal_slot: "dinner",
        dish_id: "d1",
        status: "suggested",
      }),
    ]);
    expect(safeRegenerateGroceryListForPlan).toHaveBeenCalledTimes(1);
  });

  it("loads the slot-independent inputs once, not per slot (BUG-016 / PERF-003)", async () => {
    const stub = dayClient([]);
    vi.mocked(createServerSupabaseClient).mockResolvedValue(stub.client);
    vi.mocked(loadCandidateDishes)
      .mockResolvedValueOnce([{ id: "b1" } as never])
      .mockResolvedValueOnce([{ id: "d1" } as never]);

    await ensureDaySuggestions(HH, "2026-05-25", ["breakfast", "dinner"]);

    // The candidate universe is loaded once for the day, not once per slot.
    expect(loadHouseholdContext).toHaveBeenCalledTimes(1);
    expect(loadActiveMembers).toHaveBeenCalledTimes(1);
    expect(loadMealHistory).toHaveBeenCalledTimes(1);
    // Candidate dishes are slot-specific, so one query per filled slot.
    expect(loadCandidateDishes).toHaveBeenCalledTimes(2);
  });

  it("leaves locked, eating-out, and already-filled slots untouched without loading inputs", async () => {
    const stub = dayClient([
      {
        meal_slot: "breakfast",
        dish_id: "x",
        status: "suggested",
        locked: false,
      },
      {
        meal_slot: "lunch",
        dish_id: null,
        status: "eating_out",
        locked: false,
      },
      { meal_slot: "dinner", dish_id: "y", status: "accepted", locked: true },
    ]);
    vi.mocked(createServerSupabaseClient).mockResolvedValue(stub.client);

    await ensureDaySuggestions(HH, "2026-05-25", [
      "breakfast",
      "lunch",
      "dinner",
    ]);

    expect(loadHouseholdContext).not.toHaveBeenCalled();
    expect(loadCandidateDishes).not.toHaveBeenCalled();
    expect(stub.upserted).toHaveLength(0);
    expect(safeRegenerateGroceryListForPlan).not.toHaveBeenCalled();
  });

  it("excludes a dish already chosen earlier in the run", async () => {
    const stub = dayClient([]);
    vi.mocked(createServerSupabaseClient).mockResolvedValue(stub.client);
    // Both slots can pick "x"; breakfast takes it first, so dinner skips to "y".
    vi.mocked(loadCandidateDishes)
      .mockResolvedValueOnce([{ id: "x" } as never])
      .mockResolvedValueOnce([{ id: "x" } as never, { id: "y" } as never]);

    await ensureDaySuggestions(HH, "2026-05-25", ["breakfast", "dinner"]);

    expect(
      stub.upserted.map((r) => (r as { dish_id: string }).dish_id),
    ).toEqual(["x", "y"]);
  });
});
