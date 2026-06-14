import {
  compareIdentity,
  comparePreparationLines,
  type PreparationLine,
} from "@/packages/shared/provider";

/**
 * Pure preparation aggregation (MP-A-140, design/04 § 6, UC-BATCH-002).
 *
 * Folds the per-member response lines for one menu day into the aggregate
 * preparation roster the provider cooks from. **Pure — no DB, no I/O.** The
 * cutoff (MP-A-141) and regenerate (MP-A-150) RPCs call this with the locked
 * responses, then persist the result as `provider_preparation_batch_lines`
 * inside their transaction; that persistence half is NOT here.
 *
 * Aggregation key (BR — UC-BATCH-002 "Rules"): `catalogItemId` +
 * `canonicalUnit` + `spiceLevel` + `saltLevel`. Different spice, salt, OR unit
 * values stay on **separate** lines — quantities are never summed across them
 * (you cannot add 16 oz to 24 pieces, nor pool spicy with non-spicy). Within a
 * key, `includedQuantity` (default-package) and `extraQuantity` (paid extras)
 * are summed **separately** and remain separately reportable; `totalQuantity`
 * is their sum.
 *
 * Output is deterministic (so a batch revision and its CSV/print render the
 * same row order every time): ordered by component group (canonical display
 * order), then item name, then unit, then spice, then salt, then catalog item
 * id as a final tiebreak.
 */
export function aggregatePreparation(
  memberLines: readonly PreparationLine[],
): PreparationLine[] {
  const byKey = new Map<string, PreparationLine>();

  for (const line of memberLines) {
    const key = aggregationKey(line);
    const existing = byKey.get(key);
    if (existing) {
      existing.includedQuantity += line.includedQuantity;
      existing.extraQuantity += line.extraQuantity;
      existing.totalQuantity =
        existing.includedQuantity + existing.extraQuantity;
      // itemName / componentGroup are NOT part of the key. If member lines
      // disagree for the same catalog item (e.g. a response captured before an
      // item rename/regroup), adopt a deterministic winner — smallest by
      // component-group order then name — so the aggregate row is independent
      // of member input order across revisions, not "whichever came first".
      if (compareIdentity(line, existing) < 0) {
        existing.itemName = line.itemName;
        existing.componentGroup = line.componentGroup;
      }
    } else {
      // Copy so the caller's input lines are never mutated, and recompute the
      // total from the parts rather than trusting an inbound totalQuantity.
      byKey.set(key, {
        catalogItemId: line.catalogItemId,
        itemName: line.itemName,
        componentGroup: line.componentGroup,
        spiceLevel: line.spiceLevel,
        saltLevel: line.saltLevel,
        includedQuantity: line.includedQuantity,
        extraQuantity: line.extraQuantity,
        totalQuantity: line.includedQuantity + line.extraQuantity,
        canonicalUnit: line.canonicalUnit,
      });
    }
  }

  return [...byKey.values()].sort(comparePreparationLines);
}

// A NUL byte (char code 0) joins the key parts: no field value can contain it,
// so parts can never collide across fields — e.g. a space-bearing unit shifting
// a boundary so `["a","b c"]` and `["a b","c"]` would hash alike under a space
// separator. Built with String.fromCharCode so the source stays plain text
// (a literal NUL in the file would make git treat it as binary).
const KEY_SEP = String.fromCharCode(0);

/**
 * The aggregation grouping key. NUL-joined (see KEY_SEP) so values can never
 * collide across fields.
 */
function aggregationKey(line: PreparationLine): string {
  return [
    line.catalogItemId,
    line.canonicalUnit,
    line.spiceLevel ?? "",
    line.saltLevel ?? "",
  ].join(KEY_SEP);
}

// The deterministic ordering (compareIdentity for the winner pick, and the full
// comparePreparationLines for the final sort) is the shared single source of
// truth in @mmp/shared/provider/preparation-order, reused by the CSV/print/email
// roster surfaces so every view renders the same row order.
