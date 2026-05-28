import { describe, expect, it } from "vitest";

import type { PreferredDishes } from "./draft";
import {
  builtDishNames,
  combinationDisplayNames,
  hasAnyPreferredPick,
  manualDishNames,
} from "./preferred-summary";

const ID_1 = "11111111-1111-1111-1111-111111111111";
const ID_2 = "22222222-2222-2222-2222-222222222222";

describe("combinationDisplayNames (ONB-021)", () => {
  it("prefers the name captured at pick time", () => {
    const preferred: PreferredDishes = {
      mode: "combinations",
      selectedCombinations: [
        {
          combinationId: ID_1,
          name: "Veg Thali",
          frequency: "daily",
          suitableFor: [],
        },
        {
          combinationId: ID_2,
          name: "South Indian Plate",
          frequency: "once_a_week",
          suitableFor: [],
        },
      ],
    };
    expect(combinationDisplayNames(preferred)).toEqual([
      "Veg Thali",
      "South Indian Plate",
    ]);
  });

  it("resolves id-only selections against the catalog", () => {
    const preferred: PreferredDishes = {
      mode: "combinations",
      selectedCombinations: [
        { combinationId: ID_1, frequency: "daily", suitableFor: [] },
      ],
    };
    const catalog = new Map([
      [ID_1, "Rajma Chawal"],
      [ID_2, "Chole Bhature"],
    ]);
    expect(combinationDisplayNames(preferred, catalog)).toEqual([
      "Rajma Chawal",
    ]);
  });

  it("resolves the legacy id-only `selectedCombinationIds` shape via the catalog", () => {
    const preferred: PreferredDishes = {
      mode: "combinations",
      selectedCombinationIds: [ID_1, ID_2],
    };
    const catalog = new Map([
      [ID_1, "Rajma Chawal"],
      [ID_2, "Chole Bhature"],
    ]);
    expect(combinationDisplayNames(preferred, catalog)).toEqual([
      "Rajma Chawal",
      "Chole Bhature",
    ]);
  });

  it("falls back to a generic label when neither name nor catalog resolves it", () => {
    const preferred: PreferredDishes = {
      mode: "combinations",
      selectedCombinations: [
        { combinationId: ID_1, frequency: "daily", suitableFor: [] },
      ],
    };
    expect(combinationDisplayNames(preferred)).toEqual(["Meal combination"]);
  });

  it("returns an empty list when nothing is selected", () => {
    expect(combinationDisplayNames({})).toEqual([]);
  });
});

describe("builtDishNames / manualDishNames", () => {
  it("lists self-built mains in order", () => {
    const preferred: PreferredDishes = {
      mode: "build",
      builtDishes: [
        {
          dishName: "Paneer Butter Masala",
          frequency: "daily",
          suitableFor: [],
          goesWith: [],
        },
        {
          dishName: "Idli",
          frequency: "once_a_week",
          suitableFor: [],
          goesWith: [],
        },
      ],
    };
    expect(builtDishNames(preferred)).toEqual(["Paneer Butter Masala", "Idli"]);
  });

  it("lists hand-picked favourites", () => {
    expect(manualDishNames({ dishNames: ["Masala Dosa"] })).toEqual([
      "Masala Dosa",
    ]);
  });

  it("returns empty lists for an untouched slice", () => {
    expect(builtDishNames({})).toEqual([]);
    expect(manualDishNames({})).toEqual([]);
  });
});

describe("hasAnyPreferredPick (ONB-022)", () => {
  it("is false for an empty or system-only slice", () => {
    expect(hasAnyPreferredPick({})).toBe(false);
    expect(hasAnyPreferredPick({ mode: "system" })).toBe(false);
  });

  it("is true when any of the three additive slices is populated", () => {
    expect(
      hasAnyPreferredPick({
        selectedCombinations: [
          { combinationId: ID_1, frequency: "daily", suitableFor: [] },
        ],
      }),
    ).toBe(true);
    expect(
      hasAnyPreferredPick({
        builtDishes: [
          {
            dishName: "Dal",
            frequency: "daily",
            suitableFor: [],
            goesWith: [],
          },
        ],
      }),
    ).toBe(true);
    expect(hasAnyPreferredPick({ dishNames: ["Poha"] })).toBe(true);
  });
});
