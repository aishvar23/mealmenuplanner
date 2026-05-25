/**
 * Meal "package" composition (design/08 criterion 10, BUG-008/009/010). A
 * standalone-eligible primary (`complete_meal` / `main_component`) is what the
 * engine recommends, but a bare `main_component` like Rajma Masala or Masala
 * Dosa reads as half a plate. This pure selector picks the accompaniments that
 * round it into a wholesome package — a starch base and/or a condiment — from
 * the dish's seeded `dish_pairings`.
 *
 * Pure and runtime-agnostic (no I/O): callers resolve the candidate pairings
 * (with names) — from the loaded candidate set during generation, or a DB read
 * on the plan-display path — and this decides which to show, deterministically.
 */

import type { MealRole, PairingType } from "./types";

/** A resolved `dish_pairings` row: the accompaniment dish + how it pairs. */
export interface PairingCandidate {
  dishId: string;
  dishName: string;
  pairingType: PairingType;
}

/**
 * Starch/base pairing types that complete a `main_component` into a full plate,
 * in display priority: rice first, then bread, then another main served
 * alongside (e.g. Dosa + Sambar). A `complete_meal` already stands alone, so it
 * never gets a base bolted on.
 */
const BASE_PAIRING_PRIORITY: readonly PairingType[] = [
  "rice_pairing",
  "bread_pairing",
  "main_side",
];

/**
 * Choose the package accompaniments for a primary dish, in display order
 * (base first, then condiment). Returns at most one base and one condiment, so
 * a card reads like `Rajma Masala + Steamed Rice` or
 * `Masala Dosa + Sambar + Coconut Chutney`, never an exhaustive list.
 *
 * Rules:
 *  - Only a `main_component` gets a **base** (rice/bread/side) — a `complete_meal`
 *    is whole on its own.
 *  - A **condiment** (chutney, pickle) rounds out any primary that has one
 *    seeded (MEALCOMP-002: Masala Dosa is shown with its chutney).
 *  - `beverage` pairings are never part of the meal package.
 *
 * Deterministic for a given input order; pass candidates pre-sorted when the
 * source order isn't already stable.
 */
export function selectPackagePairings(
  primaryRole: MealRole,
  candidates: readonly PairingCandidate[],
): PairingCandidate[] {
  const chosen: PairingCandidate[] = [];

  if (primaryRole === "main_component") {
    for (const type of BASE_PAIRING_PRIORITY) {
      const base = candidates.find((c) => c.pairingType === type);
      if (base) {
        chosen.push(base);
        break;
      }
    }
  }

  const condiment = candidates.find((c) => c.pairingType === "condiment");
  if (condiment && !chosen.some((c) => c.dishId === condiment.dishId)) {
    chosen.push(condiment);
  }

  return chosen;
}
