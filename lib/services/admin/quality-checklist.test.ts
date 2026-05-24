import { describe, expect, it } from "vitest";

import {
  evaluateQualityChecklist,
  type QualityInput,
} from "@/lib/services/admin/quality-checklist";

/** A dish that satisfies every required checklist item. */
function readyInput(overrides: Partial<QualityInput> = {}): QualityInput {
  return {
    name: "Rajma Chawal",
    cuisine: "North Indian",
    mealSlots: ["lunch", "dinner"],
    totalTimeMinutes: 45,
    ingredientCount: 6,
    prepTaskCount: 1,
    hasAnyTag: true,
    ...overrides,
  };
}

describe("evaluateQualityChecklist", () => {
  it("can activate when every required item is satisfied", () => {
    const result = evaluateQualityChecklist(readyInput());
    expect(result.canActivate).toBe(true);
    expect(result.unmetRequired).toEqual([]);
  });

  it("blocks activation when the cuisine is missing", () => {
    const result = evaluateQualityChecklist(readyInput({ cuisine: null }));
    expect(result.canActivate).toBe(false);
    expect(result.unmetRequired).toContain("Has a cuisine");
  });

  it("treats a whitespace-only cuisine as missing", () => {
    const result = evaluateQualityChecklist(readyInput({ cuisine: "   " }));
    expect(result.canActivate).toBe(false);
  });

  it("blocks activation with no meal slots, no total time, or no ingredients", () => {
    expect(
      evaluateQualityChecklist(readyInput({ mealSlots: [] })).canActivate,
    ).toBe(false);
    expect(
      evaluateQualityChecklist(readyInput({ totalTimeMinutes: 0 })).canActivate,
    ).toBe(false);
    expect(
      evaluateQualityChecklist(readyInput({ totalTimeMinutes: null }))
        .canActivate,
    ).toBe(false);
    expect(
      evaluateQualityChecklist(readyInput({ ingredientCount: 0 })).canActivate,
    ).toBe(false);
  });

  it("lists every unmet required item at once", () => {
    const result = evaluateQualityChecklist(
      readyInput({ cuisine: null, mealSlots: [], ingredientCount: 0 }),
    );
    expect(result.unmetRequired).toHaveLength(3);
  });

  it("does not let advisory items (prep tasks, tags) block activation", () => {
    const result = evaluateQualityChecklist(
      readyInput({ prepTaskCount: 0, hasAnyTag: false }),
    );
    expect(result.canActivate).toBe(true);
    const advisory = result.items.filter((item) => !item.required);
    expect(advisory.map((item) => item.id).sort()).toEqual([
      "prepTasks",
      "tags",
    ]);
    expect(advisory.every((item) => item.satisfied === false)).toBe(true);
  });
});
