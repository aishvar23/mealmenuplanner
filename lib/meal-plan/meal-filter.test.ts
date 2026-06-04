import { describe, expect, it } from "vitest";

import {
  comboMatchesFilter,
  dishMatchesFilter,
  type DishFilterFlags,
  noMatchLabel,
  visibleCombos,
  visibleDishes,
} from "./meal-filter";

const NONE: DishFilterFlags = { weightLoss: false, highProtein: false };
const WEIGHT_LOSS: DishFilterFlags = { weightLoss: true, highProtein: false };
const HIGH_PROTEIN: DishFilterFlags = { weightLoss: false, highProtein: true };

describe("dishMatchesFilter", () => {
  it("passes every dish when the filter is 'all'", () => {
    expect(dishMatchesFilter(NONE, "all")).toBe(true);
    expect(dishMatchesFilter(WEIGHT_LOSS, "all")).toBe(true);
  });

  it("matches the weight_loss flag", () => {
    expect(dishMatchesFilter(WEIGHT_LOSS, "weight_loss")).toBe(true);
    expect(dishMatchesFilter(HIGH_PROTEIN, "weight_loss")).toBe(false);
    expect(dishMatchesFilter(NONE, "weight_loss")).toBe(false);
  });

  it("matches the high_protein flag", () => {
    expect(dishMatchesFilter(HIGH_PROTEIN, "high_protein")).toBe(true);
    expect(dishMatchesFilter(WEIGHT_LOSS, "high_protein")).toBe(false);
    expect(dishMatchesFilter(NONE, "high_protein")).toBe(false);
  });
});

describe("comboMatchesFilter (ANY rule)", () => {
  it("passes every combo when the filter is 'all'", () => {
    expect(comboMatchesFilter([NONE, NONE], "all")).toBe(true);
    expect(comboMatchesFilter([], "all")).toBe(true);
  });

  it("matches when ANY component dish carries the flag", () => {
    expect(comboMatchesFilter([NONE, HIGH_PROTEIN, NONE], "high_protein")).toBe(
      true,
    );
    expect(comboMatchesFilter([WEIGHT_LOSS, NONE], "weight_loss")).toBe(true);
  });

  it("does not match when no component dish carries the flag", () => {
    expect(comboMatchesFilter([NONE, WEIGHT_LOSS], "high_protein")).toBe(false);
    expect(comboMatchesFilter([NONE, NONE], "weight_loss")).toBe(false);
  });

  it("an empty combo never matches a concrete filter", () => {
    expect(comboMatchesFilter([], "weight_loss")).toBe(false);
    expect(comboMatchesFilter([], "high_protein")).toBe(false);
  });
});

describe("visibleDishes", () => {
  const dishes = [
    { name: "Sprouts Salad", ...WEIGHT_LOSS },
    { name: "Paneer Bhurji", ...HIGH_PROTEIN },
    { name: "Jeera Rice", ...NONE },
  ];
  const none = () => false;

  it("narrows by search term (case-insensitive) regardless of filter", () => {
    expect(
      visibleDishes(dishes, "rice", "all", none).map((d) => d.name),
    ).toEqual(["Jeera Rice"]);
  });

  it("narrows by the goal flag", () => {
    expect(
      visibleDishes(dishes, "", "weight_loss", none).map((d) => d.name),
    ).toEqual(["Sprouts Salad"]);
  });

  it("keeps an already-selected dish visible even if it fails the goal filter", () => {
    // Jeera Rice carries no flag, but a prior pick must stay de-selectable.
    const selected = (dish: { name: string }) => dish.name === "Jeera Rice";
    expect(
      visibleDishes(dishes, "", "weight_loss", selected).map((d) => d.name),
    ).toEqual(["Sprouts Salad", "Jeera Rice"]);
  });

  it("still hides a selected dish that fails the search term", () => {
    const selected = (dish: { name: string }) => dish.name === "Jeera Rice";
    expect(visibleDishes(dishes, "paneer", "all", selected)).toHaveLength(1);
  });
});

describe("visibleCombos", () => {
  const combos = [
    { name: "Protein Plate", dishes: [HIGH_PROTEIN, NONE] },
    { name: "Light Bowl", dishes: [WEIGHT_LOSS] },
  ];
  const none = () => false;

  it("matches a combo when ANY component dish carries the flag", () => {
    expect(
      visibleCombos(combos, "", "high_protein", none).map((c) => c.name),
    ).toEqual(["Protein Plate"]);
  });

  it("keeps a selected combo visible even if it fails the goal filter", () => {
    const selected = (combo: { name: string }) => combo.name === "Light Bowl";
    expect(
      visibleCombos(combos, "", "high_protein", selected).map((c) => c.name),
    ).toEqual(["Protein Plate", "Light Bowl"]);
  });
});

describe("noMatchLabel", () => {
  it("blames the search term when one is present", () => {
    expect(noMatchLabel("dishes", "paneer", "weight_loss")).toBe(
      "No dishes match “paneer”.",
    );
  });

  it("blames the goal filter when search is empty but a chip is active", () => {
    expect(noMatchLabel("combinations", "  ", "high_protein")).toBe(
      "No combinations match this filter.",
    );
  });

  it("falls back to an empty-catalog message when nothing is narrowing", () => {
    expect(noMatchLabel("dishes", "", "all")).toBe(
      "No dishes available right now.",
    );
  });
});
