import { describe, expect, it } from "vitest";

import type { PreparationLine } from "@/packages/shared/provider";

import { aggregatePreparation } from "./aggregation";

/** Build a PreparationLine with sensible defaults; override per case. */
function line(overrides: Partial<PreparationLine>): PreparationLine {
  const included = overrides.includedQuantity ?? 0;
  const extra = overrides.extraQuantity ?? 0;
  return {
    catalogItemId: "item",
    itemName: "Item",
    componentGroup: "main",
    spiceLevel: null,
    saltLevel: null,
    includedQuantity: included,
    extraQuantity: extra,
    totalQuantity: included + extra,
    canonicalUnit: "oz",
    ...overrides,
  };
}

const DAL = "11111111-1111-1111-1111-111111111111";
const BHINDI = "22222222-2222-2222-2222-222222222222";
const ROTI = "33333333-3333-3333-3333-333333333333";

describe("aggregatePreparation", () => {
  it("reconciles the UC-BATCH-002 worked example", () => {
    // Member 1: 16 oz Dal (regular/regular), 16 oz Bhindi (spicy/regular), 12 Rotis.
    // Member 2: 16 oz Dal (regular/regular), 16 oz Bhindi (non_spicy/regular), 12 Rotis.
    const member1: PreparationLine[] = [
      line({
        catalogItemId: DAL,
        itemName: "Dal Tadka",
        componentGroup: "dal_or_legume",
        spiceLevel: "regular",
        saltLevel: "regular_salt",
        includedQuantity: 16,
      }),
      line({
        catalogItemId: BHINDI,
        itemName: "Bhindi",
        componentGroup: "sabzi",
        spiceLevel: "spicy",
        saltLevel: "regular_salt",
        includedQuantity: 16,
      }),
      line({
        catalogItemId: ROTI,
        itemName: "Roti",
        componentGroup: "bread",
        includedQuantity: 12,
        canonicalUnit: "piece",
      }),
    ];
    const member2: PreparationLine[] = [
      line({
        catalogItemId: DAL,
        itemName: "Dal Tadka",
        componentGroup: "dal_or_legume",
        spiceLevel: "regular",
        saltLevel: "regular_salt",
        includedQuantity: 16,
      }),
      line({
        catalogItemId: BHINDI,
        itemName: "Bhindi",
        componentGroup: "sabzi",
        spiceLevel: "non_spicy",
        saltLevel: "regular_salt",
        includedQuantity: 16,
      }),
      line({
        catalogItemId: ROTI,
        itemName: "Roti",
        componentGroup: "bread",
        includedQuantity: 12,
        canonicalUnit: "piece",
      }),
    ];

    const result = aggregatePreparation([...member1, ...member2]);

    // Expected output (and deterministic order: dal_or_legume → sabzi → bread,
    // then within Bhindi the spice tiebreak non_spicy < spicy).
    expect(result).toEqual([
      line({
        catalogItemId: DAL,
        itemName: "Dal Tadka",
        componentGroup: "dal_or_legume",
        spiceLevel: "regular",
        saltLevel: "regular_salt",
        includedQuantity: 32,
      }),
      line({
        catalogItemId: BHINDI,
        itemName: "Bhindi",
        componentGroup: "sabzi",
        spiceLevel: "non_spicy",
        saltLevel: "regular_salt",
        includedQuantity: 16,
      }),
      line({
        catalogItemId: BHINDI,
        itemName: "Bhindi",
        componentGroup: "sabzi",
        spiceLevel: "spicy",
        saltLevel: "regular_salt",
        includedQuantity: 16,
      }),
      line({
        catalogItemId: ROTI,
        itemName: "Roti",
        componentGroup: "bread",
        includedQuantity: 24,
        canonicalUnit: "piece",
      }),
    ]);
  });

  it("keeps different spice levels separate", () => {
    const result = aggregatePreparation([
      line({ catalogItemId: DAL, spiceLevel: "spicy", includedQuantity: 10 }),
      line({ catalogItemId: DAL, spiceLevel: "mild", includedQuantity: 10 }),
    ]);
    expect(result).toHaveLength(2);
    expect(result.map((l) => l.spiceLevel)).toEqual(["mild", "spicy"]);
  });

  it("keeps different salt levels separate", () => {
    const result = aggregatePreparation([
      line({
        catalogItemId: DAL,
        saltLevel: "high_salt",
        includedQuantity: 10,
      }),
      line({ catalogItemId: DAL, saltLevel: "low_salt", includedQuantity: 10 }),
    ]);
    expect(result).toHaveLength(2);
    expect(result.map((l) => l.saltLevel)).toEqual(["low_salt", "high_salt"]);
  });

  it("never mixes units for the same catalog item", () => {
    const result = aggregatePreparation([
      line({ catalogItemId: DAL, canonicalUnit: "oz", includedQuantity: 16 }),
      line({ catalogItemId: DAL, canonicalUnit: "piece", includedQuantity: 2 }),
    ]);
    expect(result).toHaveLength(2);
    expect(result.map((l) => [l.canonicalUnit, l.totalQuantity])).toEqual([
      ["oz", 16],
      ["piece", 2],
    ]);
  });

  it("sums included and extra separately and recomputes the total", () => {
    const result = aggregatePreparation([
      line({ catalogItemId: ROTI, includedQuantity: 4, extraQuantity: 1 }),
      line({ catalogItemId: ROTI, includedQuantity: 4, extraQuantity: 3 }),
    ]);
    expect(result).toEqual([
      line({ catalogItemId: ROTI, includedQuantity: 8, extraQuantity: 4 }),
    ]);
    expect(result[0]?.totalQuantity).toBe(12);
  });

  it("recomputes total from parts even if an inbound total is inconsistent", () => {
    const bad: PreparationLine = {
      ...line({ catalogItemId: DAL, includedQuantity: 5, extraQuantity: 2 }),
      totalQuantity: 999, // deliberately wrong
    };
    const result = aggregatePreparation([bad]);
    expect(result[0]?.totalQuantity).toBe(7);
  });

  it("does not mutate the input lines", () => {
    const input = [
      line({ catalogItemId: DAL, includedQuantity: 5 }),
      line({ catalogItemId: DAL, includedQuantity: 5 }),
    ];
    const snapshot = input.map((l) => ({ ...l }));
    aggregatePreparation(input);
    expect(input).toEqual(snapshot);
  });

  it("returns an empty array for no responses", () => {
    expect(aggregatePreparation([])).toEqual([]);
  });

  it("orders by component group, then item name", () => {
    const result = aggregatePreparation([
      line({
        catalogItemId: "z",
        itemName: "Zucchini",
        componentGroup: "side",
        includedQuantity: 1,
      }),
      line({
        catalogItemId: "a",
        itemName: "Aloo",
        componentGroup: "main",
        includedQuantity: 1,
      }),
      line({
        catalogItemId: "m",
        itemName: "Mutter",
        componentGroup: "main",
        includedQuantity: 1,
      }),
    ]);
    expect(result.map((l) => l.itemName)).toEqual([
      "Aloo",
      "Mutter",
      "Zucchini",
    ]);
  });
});
