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
  ) =>
    recs.map((r) => ({
      dishId: r.dishId,
      dishName: nameById.get(r.dishId) ?? null,
      dishImageUrl: imageById.get(r.dishId)?.imageUrl ?? null,
      dishImageAltText: imageById.get(r.dishId)?.imageAltText ?? null,
      dishImageStatus: imageById.get(r.dishId)?.imageStatus ?? null,
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

import { resolveOrCreateDayPlan, resolveOrCreateRangePlan } from "./plans";
import { suggestForSlot } from "./suggest";
import { generateToday, generateWeek } from "./generate";

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
        score: 5,
        reason: "ok",
        pairedDishes: [],
      },
    ]);
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
      dietType: "vegetarian",
      preferredCuisines: [],
      weekdayCookingTimeMinutes: null,
      weekendCookingTimeMinutes: null,
      varietyGapDays: 7,
      kidsCount: 0,
      dishFrequencies: new Map(),
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
