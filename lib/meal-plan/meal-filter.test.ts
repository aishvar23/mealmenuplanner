import { describe, expect, it } from "vitest";

import {
  comboMatchesFilter,
  dishMatchesFilter,
  type DishFilterFlags,
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
