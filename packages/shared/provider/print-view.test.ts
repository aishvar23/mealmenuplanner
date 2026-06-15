import { describe, expect, it } from "vitest";

import { providerFixtures } from "./index";
import { comparePreparationLines } from "./preparation-order";
import { buildPrintView, formatPrintTimestamp } from "./print-view";
import type { PreparationLine, ProviderBatchDetailDto } from "./dtos";

// A line that contributes a row to the per-member CSV (included > 0), so the member
// carrying it survives buildPrintView's empty-member filter.
const preparableLine: PreparationLine =
  providerFixtures.currentBatch.individualLines[0]!.lines[0]!;

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
        { memberUserId: "u-z", displayName: "Zara", lines: [preparableLine] },
        { memberUserId: "u-a", displayName: "Aanya", lines: [preparableLine] },
        { memberUserId: "u-n", displayName: null, lines: [preparableLine] },
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

  it("drops members with no preparable line, as the per-member CSV does", () => {
    // The per-member CSV (renderIndividualCsv) emits no rows for a member whose lines
    // are all zero, so the print breakdown must not list (or count) one either —
    // otherwise the printout and the CSV show a different customer set.
    const zeroLine: PreparationLine = {
      ...preparableLine,
      includedQuantity: 0,
      extraQuantity: 0,
      totalQuantity: 0,
    };
    const view = buildPrintView({
      ...batch,
      individualLines: [
        {
          memberUserId: "u-keep",
          displayName: "Keep",
          lines: [preparableLine],
        },
        { memberUserId: "u-drop", displayName: "Drop", lines: [zeroLine] },
        { memberUserId: "u-empty", displayName: "Empty", lines: [] },
      ],
    });
    expect(view.individuals.map((m) => m.displayName)).toEqual(["Keep"]);
  });
});

describe("formatPrintTimestamp", () => {
  it("formats in UTC, host-independently, with an explicit zone label", () => {
    expect(formatPrintTimestamp("2026-06-11T12:00:00Z")).toBe(
      "11 Jun 2026, 12:00 UTC",
    );
  });

  it("echoes a non-parseable input instead of printing 'Invalid Date'", () => {
    expect(formatPrintTimestamp("")).toBe("");
    expect(formatPrintTimestamp("not-a-date")).toBe("not-a-date");
  });
});
