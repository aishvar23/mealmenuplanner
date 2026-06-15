// Provider Workspace — preparation print view (MP-B-051, contract 03 § 12).
//
// A pure projection of a PERSISTED batch revision into the print-ready
// `PrintViewDto` the server-rendered `/provider/preparation/{batchId}/print`
// page consumes. Like the CSV renderers (./csv) it routes every roster through
// the single ordering authority (sortPreparationLines) so the printed page, the
// CSV exports and the summary email all show rows in the SAME deterministic
// order. No DB, no I/O — built from the batch the owner-gated read already
// returned, so a reprint of a revision is byte-for-byte the same page.

import type { ProviderBatchDetailDto, PrintViewDto } from "./dtos";
import { sortPreparationLines } from "./preparation-order";

/**
 * Members in display-name order (a missing name sorts first, as `""`), tie-broken
 * by user id — the exact order the per-member CSV uses (renderIndividualCsv), so the
 * print breakdown and the CSV list customers identically.
 */
function sortMembers(
  individuals: ProviderBatchDetailDto["individualLines"],
): ProviderBatchDetailDto["individualLines"] {
  return [...individuals].sort(
    (a, b) =>
      (a.displayName ?? "").localeCompare(b.displayName ?? "", "en", {
        numeric: true,
      }) || a.memberUserId.localeCompare(b.memberUserId),
  );
}

/**
 * Project a batch detail into the print view: the aggregate roster and each
 * member's lines sorted canonically, members in display-name order. Pure — never
 * mutates the input batch.
 */
export function buildPrintView(batch: ProviderBatchDetailDto): PrintViewDto {
  return {
    providerName: batch.providerName,
    menuDate: batch.menuDate,
    cutoffAt: batch.cutoffAt,
    revision: batch.revision,
    generatedAt: batch.generatedAt,
    totals: batch.totals,
    aggregateLines: sortPreparationLines(batch.aggregateLines),
    individuals: sortMembers(batch.individualLines).map((member) => ({
      ...member,
      lines: sortPreparationLines(member.lines),
    })),
  };
}
