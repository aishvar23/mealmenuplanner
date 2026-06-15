import { describe, expect, it } from "vitest";

import { providerFixtures } from "./index";
import { comparePreparationLines } from "./preparation-order";
import { buildPrintView } from "./print-view";
import type { ProviderBatchDetailDto } from "./dtos";

/**
 * `buildPrintView` (MP-B-051) — the pure projection of a persisted batch revision
 * into the server-rendered print page's `PrintViewDto`. It must carry the batch's
 * context through unchanged and order every roster through the single ordering
 * authority, so the printed page reconciles with the CSV exports and the email.
 */
describe("buildPrintView", () => {
  const batch = providerFixtures.currentBatch;

  it("carries the batch context onto the print view", () => {
    const view = buildPrintView(batch);
    expect(view.providerName).toBe(batch.providerName);
    expect(view.menuDate).toBe(batch.menuDate);
    expect(view.cutoffAt).toBe(batch.cutoffAt);
    expect(view.revision).toBe(batch.revision);
    expect(view.generatedAt).toBe(batch.generatedAt);
    expect(view.totals).toEqual(batch.totals);
    expect(view.individuals).toHaveLength(batch.individualLines.length);
  });

  it("does not mutate the input batch", () => {
    const before = JSON.stringify(batch);
    buildPrintView(batch);
    expect(JSON.stringify(batch)).toBe(before);
  });

  it("sorts the aggregate roster canonically even from a shuffled input", () => {
    const shuffled: ProviderBatchDetailDto = {
      ...batch,
      aggregateLines: [...batch.aggregateLines].reverse(),
    };
    const view = buildPrintView(shuffled);
    const sorted = [...view.aggregateLines].sort(comparePreparationLines);
    expect(view.aggregateLines).toEqual(sorted);
  });

  it("orders members by display name (nulls first, as the CSV does) and sorts each member's lines", () => {
    const view = buildPrintView({
      ...batch,
      individualLines: [
        { memberUserId: "u-z", displayName: "Zara", lines: [] },
        { memberUserId: "u-a", displayName: "Aanya", lines: [] },
        { memberUserId: "u-n", displayName: null, lines: [] },
      ],
    });
    expect(view.individuals.map((m) => m.displayName)).toEqual([
      null,
      "Aanya",
      "Zara",
    ]);
    for (const member of view.individuals) {
      const sorted = [...member.lines].sort(comparePreparationLines);
      expect(member.lines).toEqual(sorted);
    }
  });
});
