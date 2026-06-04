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

/** The active goal filter. `all` is the default (no narrowing). */
export type MealFilter = "all" | "weight_loss" | "high_protein";

/** The per-dish flags the filter reads; carried by every catalog/candidate item. */
export interface DishFilterFlags {
  weightLoss: boolean;
  highProtein: boolean;
}

/** Chip options in display order; `all` first as the default. */
export const MEAL_FILTER_OPTIONS: readonly {
  value: MealFilter;
  label: string;
}[] = [
  { value: "all", label: "All" },
  { value: "weight_loss", label: "Weight-loss" },
  { value: "high_protein", label: "Protein-rich" },
];

/** Whether a single dish passes the active filter. `all` always passes. */
export function dishMatchesFilter(
  flags: DishFilterFlags,
  filter: MealFilter,
): boolean {
  if (filter === "all") return true;
  return filter === "weight_loss" ? flags.weightLoss : flags.highProtein;
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
