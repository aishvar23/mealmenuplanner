/**
 * Pure resolvers for the preferred-dishes step's three additive slices (BUG-024 +
 * BUG-026). Given the draft slice, they return the human-readable picks the Review
 * step lists and the step's cross-mode summary shows — independent of which `mode`
 * is currently active. Runtime-agnostic (no React, no I/O) so both the client step
 * and the unit tests share one definition.
 */

import type { PreferredDishes } from "./draft";

/** Fallback label for a chosen combination whose name we can't resolve. */
const GENERIC_COMBINATION_LABEL = "Meal combination";

/**
 * Resolve the chosen meal combinations to display names (BUG-024, ONB-021).
 * Resolution order per combination: the `name` captured at pick time → a
 * `catalogNameById` lookup (when the catalog is available) → a generic label.
 * Reads both the P10-9 `selectedCombinations` shape and the legacy id-only
 * `selectedCombinationIds`, so a resumed pre-BUG-024 draft still resolves via the
 * catalog. Order is preserved.
 */
export function combinationDisplayNames(
  preferred: Pick<
    PreferredDishes,
    "selectedCombinations" | "selectedCombinationIds"
  >,
  catalogNameById?: ReadonlyMap<string, string>,
): string[] {
  const selected: { combinationId: string; name?: string }[] =
    preferred.selectedCombinations ??
    (preferred.selectedCombinationIds ?? []).map((id) => ({
      combinationId: id,
    }));

  return selected.map((entry) => {
    const stored = entry.name?.trim();
    if (stored) return stored;
    const fromCatalog = catalogNameById?.get(entry.combinationId)?.trim();
    return fromCatalog || GENERIC_COMBINATION_LABEL;
  });
}

/** The self-built main-dish names, in selection order (`build` mode). */
export function builtDishNames(
  preferred: Pick<PreferredDishes, "builtDishes">,
): string[] {
  return (preferred.builtDishes ?? []).map((dish) => dish.dishName);
}

/** The hand-picked favourite dish names (legacy `manual` mode). */
export function manualDishNames(
  preferred: Pick<PreferredDishes, "dishNames">,
): string[] {
  return preferred.dishNames ?? [];
}

/**
 * Whether the household made any explicit Step-3 pick across the three additive
 * slices. When false, the planner chooses for them (the "system" baseline) — the
 * accurate empty state Review shows (ONB-022).
 */
export function hasAnyPreferredPick(preferred: PreferredDishes): boolean {
  return (
    combinationDisplayNames(preferred).length > 0 ||
    builtDishNames(preferred).length > 0 ||
    manualDishNames(preferred).length > 0
  );
}
