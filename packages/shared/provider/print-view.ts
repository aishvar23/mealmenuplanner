// Provider Workspace — preparation print view (MP-B-051, contract 03 § 12).
//
// A pure projection of a PERSISTED batch revision into the print-ready
// `PrintViewDto` the server-rendered `/provider/preparation/{batchId}/print`
// page consumes. Like the CSV renderers (./csv) it routes every roster through
// the single ordering authority (sortPreparationLines / compareBatchMembers) so
// the printed page, the CSV exports and the summary email all show the SAME rows
// in the SAME deterministic order. No DB, no I/O — built from the batch the
// owner-gated read already returned, so a reprint of a revision is byte-for-byte
// the same page.

import type {
  PreparationLine,
  ProviderBatchDetailDto,
  PrintViewDto,
} from "./dtos";
import { compareBatchMembers, sortPreparationLines } from "./preparation-order";

/** A member contributes at least one row to the per-member CSV (renderIndividualCsv). */
function hasPreparableLine(lines: readonly PreparationLine[]): boolean {
  return lines.some(
    (line) => line.includedQuantity > 0 || line.extraQuantity > 0,
  );
}

/**
 * Format a batch timestamp for the printed header in a HOST-INDEPENDENT way: a
 * pinned locale + an explicit UTC zone, so the same revision prints the same
 * string on every server — the page is otherwise byte-for-byte reproducible, and
 * a bare `toLocaleString()` would silently render the deployment server's
 * timezone (e.g. UTC on the host) instead of a stable, labelled time.
 *
 * MVP decision (ADO #26): the printed cutoff/generated times are shown in UTC,
 * explicitly labelled, rather than the owner's local zone. Owner-timezone
 * rendering needs the provider's stored zone (not yet on the batch read) and is
 * deferred. A non-parseable input is echoed back rather than printing the literal
 * "Invalid Date".
 */
export function formatPrintTimestamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const formatted = new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(date);
  return `${formatted} UTC`;
}

/**
 * Project a batch detail into the print view: the aggregate roster and each
 * member's lines sorted canonically, members in the same display-name order the
 * per-member CSV uses (compareBatchMembers). Members with no preparable line are
 * dropped so the printed breakdown lists the SAME customers (and the same count)
 * the per-member CSV does — the CSV emits no rows for an all-zero member, so the
 * print page must not show one either. Pure — never mutates the input batch.
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
    individuals: [...batch.individualLines]
      .filter((member) => hasPreparableLine(member.lines))
      .sort(compareBatchMembers)
      .map((member) => ({
        ...member,
        lines: sortPreparationLines(member.lines),
      })),
  };
}
