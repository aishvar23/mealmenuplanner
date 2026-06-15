// Provider Workspace — canonical preparation-line ordering (contract 03 § 10/§ 11).
//
// The single source of truth for how preparation lines sort, so the cutoff
// aggregator (lib/services/provider/aggregation.ts), the CSV export
// (./csv), and the print/email views all render rows in the SAME deterministic
// order. Pure — no DB, no I/O — so it lives in the shared package and is consumed
// identically by the web service, the web mock, and the mobile mock.
//
// Order (UC-BATCH-002): component group (canonical display order), then item
// name, then unit, then spice, then salt, then catalog item id as a final
// tiebreak. null variant values sort first.

import type { ProviderSaltLevel, ProviderSpiceLevel } from "./enums";
import { PROVIDER_COMPONENT_GROUPS } from "./labels";
import type { PreparationLine } from "./dtos";

const COMPONENT_GROUP_RANK = new Map<string, number>(
  PROVIDER_COMPONENT_GROUPS.map((g, i) => [g, i]),
);

// Stable tiebreak orders for the optional variant fields (null sorts first).
const SPICE_RANK: Record<ProviderSpiceLevel, number> = {
  non_spicy: 0,
  mild: 1,
  regular: 2,
  spicy: 3,
};
const SALT_RANK: Record<ProviderSaltLevel, number> = {
  low_salt: 0,
  regular_salt: 1,
  high_salt: 2,
};

/**
 * Pinned, locale-stable text comparison. A fixed locale + numeric collation
 * makes ordering reproducible across hosts (the runtime default locale is
 * host-dependent), so a batch revision and its CSV/print render the same row
 * order everywhere.
 */
function compareText(a: string, b: string): number {
  return a.localeCompare(b, "en", { numeric: true });
}

/**
 * Deterministic order over the non-key display fields (component-group display
 * order, then item name). Also picks a stable winner when member lines carry
 * differing itemName / componentGroup for the same aggregation key.
 */
export function compareIdentity(
  a: Pick<PreparationLine, "componentGroup" | "itemName">,
  b: Pick<PreparationLine, "componentGroup" | "itemName">,
): number {
  const groupDelta =
    (COMPONENT_GROUP_RANK.get(a.componentGroup) ?? Number.MAX_SAFE_INTEGER) -
    (COMPONENT_GROUP_RANK.get(b.componentGroup) ?? Number.MAX_SAFE_INTEGER);
  if (groupDelta !== 0) return groupDelta;
  return compareText(a.itemName, b.itemName);
}

// null (no variant selected) sorts before any concrete level.
function rankOrNull<K extends string>(
  value: K | null,
  ranks: Record<K, number>,
): number {
  return value === null ? -1 : ranks[value];
}

/** The full deterministic comparator over a preparation line (see file header). */
export function comparePreparationLines(
  a: PreparationLine,
  b: PreparationLine,
): number {
  const identityDelta = compareIdentity(a, b);
  if (identityDelta !== 0) return identityDelta;

  const unitDelta = compareText(a.canonicalUnit, b.canonicalUnit);
  if (unitDelta !== 0) return unitDelta;

  const spiceDelta =
    rankOrNull(a.spiceLevel, SPICE_RANK) - rankOrNull(b.spiceLevel, SPICE_RANK);
  if (spiceDelta !== 0) return spiceDelta;

  const saltDelta =
    rankOrNull(a.saltLevel, SALT_RANK) - rankOrNull(b.saltLevel, SALT_RANK);
  if (saltDelta !== 0) return saltDelta;

  // Final tiebreak: two distinct catalog items identical in every sorted field
  // above still get a stable, input-order-independent order.
  return compareText(a.catalogItemId, b.catalogItemId);
}

/**
 * Return a new array of the lines in canonical order. Pure — never mutates the
 * input. The single ordering authority every roster surface routes through.
 */
export function sortPreparationLines(
  lines: readonly PreparationLine[],
): PreparationLine[] {
  return [...lines].sort(comparePreparationLines);
}

/**
 * Canonical member ordering for the per-member surfaces: by display name (a
 * missing name sorts first, as `""`) under the same pinned locale + numeric
 * collation, tie-broken by user id. The single authority both the per-member CSV
 * (./csv `renderIndividualCsv`) and the print view (./print-view `buildPrintView`)
 * route through, so the two list customers in the SAME order — change it here and
 * both surfaces move together rather than silently diverging.
 */
export function compareBatchMembers(
  a: { displayName: string | null; memberUserId: string },
  b: { displayName: string | null; memberUserId: string },
): number {
  return (
    compareText(a.displayName ?? "", b.displayName ?? "") ||
    a.memberUserId.localeCompare(b.memberUserId)
  );
}
