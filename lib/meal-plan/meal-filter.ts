/**
 * Top-level meal "goal" filter shared across the dish/combination pickers
 * (onboarding preferred-dishes step + the Today/Weekly "Change meal" picker).
 *
 * A pure **client-side display filter**: by default every item loads, and
 * selecting a chip narrows the rendered list to dishes that carry the matching
 * dietician-curated flag. It does NOT touch the recommendation engine — these
 * flags are descriptive (`weight_loss`, `high_protein` on `dishes`), never a
 * scoring signal. Keep this module pure (no `server-only`, no I/O) so both
 * server-rendered catalogs and client components can share the predicate.
 */

import type { Option } from "@/lib/onboarding";

/** The active goal filter. `all` is the default (no narrowing). */
export type MealFilter = "all" | "weight_loss" | "high_protein";

/** The per-dish flags the filter reads; carried by every catalog/candidate item. */
export interface DishFilterFlags {
  weightLoss: boolean;
  highProtein: boolean;
}

/** A catalog dish the search + goal filter narrows: its name plus the goal flags. */
export interface FilterableDish extends DishFilterFlags {
  name: string;
}

/** A catalog combination: its name plus the component dishes' goal flags. */
export interface FilterableCombo {
  name: string;
  dishes: readonly DishFilterFlags[];
}

/** Chip options in display order; `all` first as the default. */
export const MEAL_FILTER_OPTIONS: readonly Option<MealFilter>[] = [
  { value: "all", label: "All" },
  { value: "weight_loss", label: "Weight-loss" },
  { value: "high_protein", label: "Protein-rich" },
];

/** Whether a single dish passes the active filter. `all` always passes. */
export function dishMatchesFilter(
  flags: DishFilterFlags,
  filter: MealFilter,
): boolean {
  switch (filter) {
    case "all":
      return true;
    case "weight_loss":
      return flags.weightLoss;
    case "high_protein":
      return flags.highProtein;
    default: {
      // Exhaustiveness guard: a new MealFilter member must extend this switch,
      // not silently fall through to whichever flag the last branch returned.
      const _exhaustive: never = filter;
      return _exhaustive;
    }
  }
}

/**
 * Whether a meal combination passes the active filter. A combination is a full
 * plate of several dishes, so it qualifies when **any** component dish carries
 * the flag (the ANY rule): rice/roti are rarely flagged `high_protein`, so an
 * "every dish must match" rule would render the filter near-empty. `all` always
 * passes.
 */
export function comboMatchesFilter(
  dishes: readonly DishFilterFlags[],
  filter: MealFilter,
): boolean {
  if (filter === "all") return true;
  return dishes.some((dish) => dishMatchesFilter(dish, filter));
}

/**
 * Narrow a dish catalog by the search box AND the goal chip for a picker grid.
 * Already-selected dishes always survive the goal filter so a pick made under
 * one chip never becomes hidden-yet-still-selected when the chip changes — the
 * search box (transient text) still applies to everything.
 */
export function visibleDishes<T extends FilterableDish>(
  dishes: readonly T[],
  search: string,
  filter: MealFilter,
  isSelected: (dish: T) => boolean,
): T[] {
  const query = search.trim().toLowerCase();
  return dishes.filter(
    (dish) =>
      dish.name.toLowerCase().includes(query) &&
      (isSelected(dish) || dishMatchesFilter(dish, filter)),
  );
}

/** Combination counterpart of {@link visibleDishes} (uses the ANY combo rule). */
export function visibleCombos<T extends FilterableCombo>(
  combos: readonly T[],
  search: string,
  filter: MealFilter,
  isSelected: (combo: T) => boolean,
): T[] {
  const query = search.trim().toLowerCase();
  return combos.filter(
    (combo) =>
      combo.name.toLowerCase().includes(query) &&
      (isSelected(combo) || comboMatchesFilter(combo.dishes, filter)),
  );
}

/**
 * The "nothing matched" message for a picker grid, attributing the emptiness to
 * whichever control actually narrowed it: an active search term, otherwise the
 * goal chip, otherwise a genuinely empty catalog.
 */
export function noMatchLabel(
  noun: string,
  search: string,
  filter: MealFilter,
): string {
  if (search.trim()) return `No ${noun} match “${search}”.`;
  if (filter !== "all") return `No ${noun} match this filter.`;
  return `No ${noun} available right now.`;
}
