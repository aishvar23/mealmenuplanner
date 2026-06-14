// Provider Workspace — preparation CSV export (MP-A-160, contract 03 § 11).
//
// Pure renderers that turn a persisted batch revision's roster into the two
// owner-facing CSV exports. No DB, no I/O — the web export route, the web mock,
// and the mobile mock all import these so a downloaded CSV is byte-identical
// whichever path produced it. The data itself is read owner-gated server-side
// (lib/services/provider/batch-read.ts → get_provider_batch RPC).
//
// Format guarantees (§ 11):
//   • UTF-8 with a BOM so spreadsheet apps detect the encoding.
//   • RFC-4180 escaping: a field containing a comma, double-quote, CR or LF is
//     wrapped in double-quotes with internal quotes doubled; records end CRLF.
//   • Formula-injection defence (OWASP CSV injection): a cell whose first
//     character is one of `= + - @` (or a tab / CR that some apps treat as a
//     formula lead-in) is prefixed with a single quote so a spreadsheet never
//     evaluates it. Quantities are non-negative so a numeric cell never trips it.
//   • Deterministic row order via the shared comparator (sortPreparationLines),
//     so the same revision always exports the same bytes.

import type { BatchDto, PreparationLine } from "./dtos";
import { sortPreparationLines } from "./preparation-order";

/** Byte-order mark prefixing every export so Excel reads it as UTF-8. */
export const CSV_BOM = String.fromCharCode(0xfeff);

/** RFC-4180 record separator. */
const CRLF = "\r\n";

/** Characters that lead a spreadsheet formula — guarded against (OWASP). */
const FORMULA_LEAD = new Set(["=", "+", "-", "@", "\t", "\r"]);

/**
 * A formula lead-in (`= + - @`) preceded by optional leading whitespace. Some
 * spreadsheet apps trim a leading space/tab/newline before deciding whether a
 * cell is a formula, so `" =1+1"` would evaluate even though its first char is a
 * space — the bare `FORMULA_LEAD.has(cell[0])` check alone misses that (review
 * PR #47, finding #4). This catches a trigger after any run of leading whitespace.
 */
const WHITESPACE_THEN_FORMULA = /^\s*[=+\-@]/;

/**
 * Make one cell safe: neutralise a formula lead-in, then RFC-4180-quote when the
 * value contains a delimiter, quote, or newline. Applied to every cell uniformly
 * (defence in depth) — a numeric or boolean cell simply never trips either rule.
 */
export function escapeCsvCell(value: string): string {
  let cell = value;
  if (
    cell.length > 0 &&
    (FORMULA_LEAD.has(cell[0]!) || WHITESPACE_THEN_FORMULA.test(cell))
  ) {
    cell = `'${cell}`;
  }
  if (/[",\r\n]/.test(cell)) {
    cell = `"${cell.replace(/"/g, '""')}"`;
  }
  return cell;
}

/** A quantity → its shortest exact decimal (numeric(10,3) → trim trailing zeros). */
export function formatQuantity(value: number): string {
  // toFixed(3) pins the scale to the DB's numeric(10,3); Number(...) drops the
  // trailing zeros so 32.000 → "32" and 24.500 → "24.5".
  return Number(value.toFixed(3)).toString();
}

/** Optional enum value → its raw stable token, or "" for null (machine-readable). */
function optional(value: string | null): string {
  return value ?? "";
}

function toRecord(cells: readonly string[]): string {
  return cells.map(escapeCsvCell).join(",");
}

function assemble(
  header: readonly string[],
  rows: readonly string[][],
): string {
  const records = [toRecord(header), ...rows.map(toRecord)];
  return CSV_BOM + records.join(CRLF) + CRLF;
}

const AGGREGATE_HEADER = [
  "component_group",
  "item_name",
  "spice_level",
  "salt_level",
  "included_quantity",
  "extra_quantity",
  "total_quantity",
  "canonical_unit",
] as const;

/**
 * The aggregate roster the provider cooks from: one row per aggregated line, in
 * canonical order, with the included / extra / total quantities reported
 * separately (UC-BATCH-002).
 */
export function renderAggregateCsv(lines: readonly PreparationLine[]): string {
  const rows = sortPreparationLines(lines).map((line) => [
    line.componentGroup,
    line.itemName,
    optional(line.spiceLevel),
    optional(line.saltLevel),
    formatQuantity(line.includedQuantity),
    formatQuantity(line.extraQuantity),
    formatQuantity(line.totalQuantity),
    line.canonicalUnit,
  ]);
  return assemble(AGGREGATE_HEADER, rows);
}

const INDIVIDUAL_HEADER = [
  "member_name",
  "component_group",
  "item_name",
  "spice_level",
  "salt_level",
  "quantity",
  "canonical_unit",
  "is_extra",
] as const;

/**
 * The per-member breakdown: members in display-name order, each line split into
 * its included and extra portions (the `is_extra` flag) so the export reconciles
 * row-for-row with the aggregate. A line contributes an `is_extra=false` row when
 * it has an included quantity and an `is_extra=true` row when it has an extra.
 */
export function renderIndividualCsv(
  individuals: BatchDto["individualLines"],
): string {
  const members = [...individuals].sort(
    (a, b) =>
      (a.displayName ?? "").localeCompare(b.displayName ?? "", "en", {
        numeric: true,
      }) || a.memberUserId.localeCompare(b.memberUserId),
  );

  const rows: string[][] = [];
  for (const member of members) {
    const name = member.displayName ?? "";
    for (const line of sortPreparationLines(member.lines)) {
      if (line.includedQuantity > 0) {
        rows.push([
          name,
          line.componentGroup,
          line.itemName,
          optional(line.spiceLevel),
          optional(line.saltLevel),
          formatQuantity(line.includedQuantity),
          line.canonicalUnit,
          "false",
        ]);
      }
      if (line.extraQuantity > 0) {
        rows.push([
          name,
          line.componentGroup,
          line.itemName,
          optional(line.spiceLevel),
          optional(line.saltLevel),
          formatQuantity(line.extraQuantity),
          line.canonicalUnit,
          "true",
        ]);
      }
    }
  }
  return assemble(INDIVIDUAL_HEADER, rows);
}
