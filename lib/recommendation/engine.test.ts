import { describe, expect, it } from "vitest";

import { RECOMMENDATION_CONFIG } from "@/lib/recommendation/config";
import { recommendSlot } from "@/lib/recommendation/engine";
import {
  emptyHistory,
  makeDish,
  makeHousehold,
  makeIngredient,
  makeMember,
} from "@/lib/recommendation/test-fixtures";
import type { SlotRecommendationInput } from "@/lib/recommendation/types";

// 2026-05-25 is a Monday (weekday); dinner mealtime is 19:00 UTC.
const WEEKDAY = "2026-05-25";
const MORNING = new Date("2026-05-25T09:00:00Z");

function input(
  overrides: Partial<SlotRecommendationInput> = {},
): SlotRecommendationInput {
  return {
    household: makeHousehold(),
    members: [],
    dishes: [],
    history: emptyHistory(),
    date: WEEKDAY,
    mealSlot: "dinner",
    now: MORNING,
    ...overrides,
  };
}

describe("recommendSlot — valid, explained recommendations", () => {
  it("ranks compatible dishes and returns an explanation for each", () => {
    const dal = makeDish({
      id: "dal",
      name: "Dal Tadka",
      totalTimeMinutes: 30,
    });
    const paneer = makeDish({
      id: "paneer",
      name: "Paneer Butter Masala",
      totalTimeMinutes: 60, // exceeds the 45-min weekday limit
    });

    const result = recommendSlot(input({ dishes: [paneer, dal] }));

    expect(result.map((r) => r.dishId)).toEqual(["dal", "paneer"]);
    expect(result[0]?.score).toBe(250); // 100+50+30+30+40
    expect(result[1]?.score).toBe(180); // 100+50+30-40+40
    expect(result[0]?.reason).toMatch(/^Suggested because /);
    expect(result[1]?.missingConstraints.map((c) => c.type)).toContain(
      "exceedsCookingTime",
    );
  });
});

describe("recommendSlot — hard filters (design/05 §4)", () => {
  it("excludes a dish that violates the household diet", () => {
    const chicken = makeDish({ id: "chicken", dietType: "non_vegetarian" });
    const dal = makeDish({ id: "dal" });
    const result = recommendSlot(input({ dishes: [chicken, dal] }));
    expect(result.map((r) => r.dishId)).toEqual(["dal"]);
  });

  it("excludes a dish containing a member's allergen", () => {
    const peanutDish = makeDish({
      id: "peanut",
      ingredients: [
        makeIngredient({
          ingredientId: "ing-peanut",
          name: "peanut",
          category: "pantry",
        }),
      ],
    });
    const dal = makeDish({ id: "dal" });
    const result = recommendSlot(
      input({
        dishes: [peanutDish, dal],
        members: [makeMember({ allergies: ["peanut"] })],
      }),
    );
    expect(result.map((r) => r.dishId)).toEqual(["dal"]);
  });

  it("excludes a dish that does not match the requested slot", () => {
    const breakfastOnly = makeDish({ id: "poha", mealSlots: ["breakfast"] });
    const result = recommendSlot(input({ dishes: [breakfastOnly] }));
    expect(result).toEqual([]);
  });

  it("excludes a do-not-suggest-again dish", () => {
    const banned = makeDish({ id: "banned" });
    const result = recommendSlot(
      input({
        dishes: [banned],
        history: emptyHistory({
          doNotSuggestAgainDishIds: new Set(["banned"]),
        }),
      }),
    );
    expect(result).toEqual([]);
  });

  it("excludes a prep-impossible dish today but keeps it as deferrable for a future date", () => {
    const rajma = makeDish({
      id: "rajma",
      name: "Rajma",
      totalTimeMinutes: 40,
      prepTasks: [
        {
          taskName: "Soak rajma",
          requiredBeforeMinutes: 480,
          description: "Soak overnight",
        },
      ],
    });
    const sixPm = new Date("2026-05-25T18:00:00Z"); // 60 min to dinner < 480 soak

    // Today: impossible → excluded.
    expect(recommendSlot(input({ dishes: [rajma], now: sixPm }))).toEqual([]);

    // Tomorrow: ample lead → deferrable, included with a prep task + caveat.
    const tomorrow = recommendSlot(
      input({ dishes: [rajma], date: "2026-05-26", now: sixPm }),
    );
    expect(tomorrow.map((r) => r.dishId)).toEqual(["rajma"]);
    expect(tomorrow[0]?.prepTasks[0]?.taskName).toBe("Soak rajma");
    expect(tomorrow[0]?.missingConstraints.map((c) => c.type)).toContain(
      "missingPrep",
    );
  });
});

describe("recommendSlot — deterministic ordering (design/05 §1, §5)", () => {
  it("breaks score ties by total time asc, then dish id asc", () => {
    // Three identically-scored dishes; differ only by total time / id.
    const slow = makeDish({ id: "z-slow", totalTimeMinutes: 40 });
    const fastB = makeDish({ id: "b-fast", totalTimeMinutes: 20 });
    const fastA = makeDish({ id: "a-fast", totalTimeMinutes: 20 });
    const result = recommendSlot(input({ dishes: [slow, fastB, fastA] }));
    expect(result.map((r) => r.dishId)).toEqual(["a-fast", "b-fast", "z-slow"]);
  });

  it("produces identical output (incl. reasons) on repeated runs", () => {
    const dishes = [
      makeDish({ id: "a", name: "Dal" }),
      makeDish({ id: "b", name: "Sabzi", totalTimeMinutes: 25 }),
    ];
    const first = recommendSlot(input({ dishes }));
    const second = recommendSlot(input({ dishes }));
    expect(second).toEqual(first);
  });

  it("honors topN", () => {
    const dishes = Array.from({ length: 6 }, (_, i) =>
      makeDish({ id: `dish-${i}`, totalTimeMinutes: 20 + i }),
    );
    const result = recommendSlot({
      ...input({ dishes }),
      config: { ...RECOMMENDATION_CONFIG, topN: 2 },
    });
    expect(result).toHaveLength(2);
  });

  it("treats usedThisRun dishes as recently cooked", () => {
    const fresh = makeDish({ id: "fresh", totalTimeMinutes: 30 });
    const used = makeDish({ id: "used", totalTimeMinutes: 30 });
    const result = recommendSlot(
      input({ dishes: [used, fresh], usedThisRun: new Set(["used"]) }),
    );
    // fresh keeps +40, used takes −60 → fresh ranks first.
    expect(result.map((r) => r.dishId)).toEqual(["fresh", "used"]);
    expect(result[0]!.score - result[1]!.score).toBe(100);
  });
});

describe("recommendSlot — output contract (design/05 §9)", () => {
  it("maps prep tasks and paired dishes onto each recommendation", () => {
    const dish = makeDish({
      id: "thali",
      prepTasks: [
        { taskName: "Soak dal", requiredBeforeMinutes: 60, description: null },
      ],
      pairings: [{ dishId: "rice", pairingType: "rice_pairing" }],
    });
    const [rec] = recommendSlot(input({ dishes: [dish], now: MORNING }));
    expect(rec?.prepTasks).toEqual([
      { taskName: "Soak dal", requiredBeforeMinutes: 60, description: null },
    ]);
    expect(rec?.pairedDishes).toEqual([
      { dishId: "rice", pairingType: "rice_pairing" },
    ]);
  });

  it("returns an empty list when no candidate survives", () => {
    expect(recommendSlot(input({ dishes: [] }))).toEqual([]);
  });
});
