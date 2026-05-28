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

  it("excludes a dish from a slot the household didn't mark suitable (P10-8)", () => {
    // Dish is globally lunch+dinner, but the household restricted it to lunch.
    const lunchOnlyForHousehold = makeDish({ id: "dal" });
    const household = makeHousehold({
      dishSuitableSlots: new Map([["dal", ["lunch"]]]),
    });
    const result = recommendSlot(
      input({ dishes: [lunchOnlyForHousehold], household, mealSlot: "dinner" }),
    );
    expect(result).toEqual([]);
  });

  it("keeps a dish in a slot the household marked suitable (P10-8)", () => {
    const dal = makeDish({ id: "dal" });
    const household = makeHousehold({
      dishSuitableSlots: new Map([["dal", ["lunch", "dinner"]]]),
    });
    const result = recommendSlot(
      input({ dishes: [dal], household, mealSlot: "dinner" }),
    );
    expect(result.map((r) => r.dishId)).toEqual(["dal"]);
  });

  it("applies no slot restriction when the household list is empty (P10-8)", () => {
    const dal = makeDish({ id: "dal" });
    const household = makeHousehold({
      dishSuitableSlots: new Map([["dal", []]]),
    });
    const result = recommendSlot(
      input({ dishes: [dal], household, mealSlot: "dinner" }),
    );
    expect(result.map((r) => r.dishId)).toEqual(["dal"]);
  });

  it("excludes non-standalone roles (side/condiment/component) (BUG-008/009/010)", () => {
    const raita = makeDish({
      id: "raita",
      name: "Boondi Raita",
      mealRole: "side",
    });
    const chutney = makeDish({
      id: "chutney",
      name: "Coconut Chutney",
      mealRole: "condiment",
    });
    const rice = makeDish({
      id: "rice",
      name: "Jeera Rice",
      mealRole: "rice_component",
    });
    const dal = makeDish({ id: "dal", mealRole: "main_component" });
    const pulao = makeDish({
      id: "pulao",
      name: "Veg Pulao",
      mealRole: "complete_meal",
    });

    const result = recommendSlot(
      input({ dishes: [raita, chutney, rice, dal, pulao] }),
    );

    // Only the standalone-eligible roles survive as primary recommendations.
    expect(result.map((r) => r.dishId).sort()).toEqual(["dal", "pulao"]);
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

describe("recommendSlot — household-chosen dishes (BUG-015)", () => {
  it("ranks the household's chosen dishes above unchosen catalog dishes (REC-004)", () => {
    const chosenA = makeDish({
      id: "chosen-a",
      name: "Rajma",
      totalTimeMinutes: 30,
    });
    const chosenB = makeDish({
      id: "chosen-b",
      name: "Chole",
      totalTimeMinutes: 30,
    });
    const other1 = makeDish({
      id: "other-1",
      name: "Bhindi",
      totalTimeMinutes: 30,
    });
    const other2 = makeDish({
      id: "other-2",
      name: "Aloo Gobi",
      totalTimeMinutes: 30,
    });
    // Both chosen at the *default* once_in_a_while tier — before BUG-015 these
    // would have ranked below the unchosen dishes.
    const household = makeHousehold({
      dishFrequencies: new Map([
        ["chosen-a", "once_in_a_while"],
        ["chosen-b", "once_in_a_while"],
      ]),
      chosenDishIds: new Set(["chosen-a", "chosen-b"]),
    });
    const result = recommendSlot(
      input({ dishes: [other1, chosenB, other2, chosenA], household }),
    );
    // BUG-027 strengthened this from "ranked above" to "exclusively": once a
    // household has built its own list, the unchosen catalog dishes are dropped
    // entirely, not merely out-ranked.
    expect(result.map((r) => r.dishId).sort()).toEqual([
      "chosen-a",
      "chosen-b",
    ]);
  });

  it("excludes a chosen dish that violates a hard filter despite the bonus (REC-006)", () => {
    const chosenNonVeg = makeDish({
      id: "chicken",
      dietType: "non_vegetarian",
    });
    const household = makeHousehold({
      dishFrequencies: new Map([["chicken", "daily"]]),
      chosenDishIds: new Set(["chicken"]),
    });
    const result = recommendSlot(input({ dishes: [chosenNonVeg], household }));
    expect(result).toEqual([]);
  });
});

describe("recommendSlot — chosen-only restriction (BUG-027)", () => {
  it("offers ONLY the household's chosen dishes, never the wider catalog", () => {
    const chosen = makeDish({ id: "chosen", name: "Rajma" });
    const catalogA = makeDish({ id: "catalog-a", name: "Bhindi" });
    const catalogB = makeDish({ id: "catalog-b", name: "Aloo Gobi" });
    const household = makeHousehold({ chosenDishIds: new Set(["chosen"]) });

    const result = recommendSlot(
      input({ dishes: [catalogA, chosen, catalogB], household }),
    );

    expect(result.map((r) => r.dishId)).toEqual(["chosen"]);
  });

  it("keeps the full catalog eligible when the household has chosen nothing", () => {
    const a = makeDish({ id: "a", totalTimeMinutes: 30 });
    const b = makeDish({ id: "b", totalTimeMinutes: 30 });
    // Default household: chosenDishIds is empty → no restriction.
    const result = recommendSlot(input({ dishes: [a, b] }));

    expect(result.map((r) => r.dishId).sort()).toEqual(["a", "b"]);
  });

  it("filters chosen dishes by slot — a chosen dish the household limited to another slot is dropped", () => {
    // Chosen for breakfast only; we recommend for dinner.
    const breakfastOnly = makeDish({
      id: "breakfast-only",
      mealSlots: ["breakfast", "dinner"],
    });
    const dinnerChosen = makeDish({
      id: "dinner-chosen",
      mealSlots: ["lunch", "dinner"],
    });
    const household = makeHousehold({
      chosenDishIds: new Set(["breakfast-only", "dinner-chosen"]),
      dishSuitableSlots: new Map([["breakfast-only", ["breakfast"]]]),
    });

    const result = recommendSlot(
      input({ dishes: [breakfastOnly, dinnerChosen], household }),
    );

    expect(result.map((r) => r.dishId)).toEqual(["dinner-chosen"]);
  });

  it("does not restrict to chosen dishes when combinations are disabled (doc-04 baseline)", () => {
    const chosen = makeDish({ id: "chosen" });
    const catalog = makeDish({ id: "catalog" });
    const household = makeHousehold({ chosenDishIds: new Set(["chosen"]) });

    const result = recommendSlot(
      input({
        dishes: [chosen, catalog],
        household,
        config: {
          ...RECOMMENDATION_CONFIG,
          combinations: { enabled: false, popularityThreshold: 5 },
        },
      }),
    );

    expect(result.map((r) => r.dishId).sort()).toEqual(["catalog", "chosen"]);
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
