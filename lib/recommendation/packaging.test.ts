import { describe, expect, it } from "vitest";

import { selectPackagePairings, type PairingCandidate } from "./packaging";

const rice: PairingCandidate = {
  dishId: "rice",
  dishName: "Steamed Rice",
  pairingType: "rice_pairing",
};
const bread: PairingCandidate = {
  dishId: "bread",
  dishName: "Tandoori Roti",
  pairingType: "bread_pairing",
};
const side: PairingCandidate = {
  dishId: "sambar",
  dishName: "Sambar",
  pairingType: "main_side",
};
const chutney: PairingCandidate = {
  dishId: "chutney",
  dishName: "Coconut Chutney",
  pairingType: "condiment",
};
const beverage: PairingCandidate = {
  dishId: "lassi",
  dishName: "Lassi",
  pairingType: "beverage",
};

describe("selectPackagePairings", () => {
  it("pairs a main_component with its rice base (Rajma + Steamed Rice)", () => {
    expect(selectPackagePairings("main_component", [rice])).toEqual([rice]);
  });

  it("prefers rice over bread over a main_side base", () => {
    expect(
      selectPackagePairings("main_component", [side, bread, rice]),
    ).toEqual([rice]);
    expect(selectPackagePairings("main_component", [side, bread])).toEqual([
      bread,
    ]);
    expect(selectPackagePairings("main_component", [side])).toEqual([side]);
  });

  it("includes a base and a condiment (Masala Dosa + Sambar + Coconut Chutney)", () => {
    expect(selectPackagePairings("main_component", [side, chutney])).toEqual([
      side,
      chutney,
    ]);
  });

  it("never bolts a starch base onto a complete_meal, but keeps a condiment", () => {
    // A complete_meal stands alone — no rice/bread added…
    expect(selectPackagePairings("complete_meal", [rice, bread])).toEqual([]);
    // …but an accompaniment (raita-style condiment) still rounds it out.
    expect(selectPackagePairings("complete_meal", [rice, chutney])).toEqual([
      chutney,
    ]);
  });

  it("includes the dosa's chutney even with no rice/bread base seeded", () => {
    expect(selectPackagePairings("main_component", [chutney])).toEqual([
      chutney,
    ]);
  });

  it("ignores beverage pairings and returns nothing when there is no package", () => {
    expect(selectPackagePairings("main_component", [beverage])).toEqual([]);
    expect(selectPackagePairings("main_component", [])).toEqual([]);
    expect(selectPackagePairings("complete_meal", [])).toEqual([]);
  });
});
