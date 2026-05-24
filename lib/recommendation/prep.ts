/**
 * Prep-aware feasibility (design/05 § 7). A dish's longest advance-prep lead
 * (`dish_prep_tasks.required_before_minutes`) is compared against the minutes
 * remaining until the slot's mealtime:
 *
 *   - no prep tasks                        → `none`        (no factor, no filter)
 *   - lead ≤ time remaining                → `deferrable`  → soft −60 (§5) + prep task
 *   - lead > time remaining                → `impossible`  → HARD EXCLUDE (§4)
 *
 * The MVP does not track "prep already completed for this dish/date", so an
 * uncompleted-but-feasible prep is always `deferrable` (the engine still emits
 * the prep task on the output contract so the app can remind). For future-dated
 * planning the time remaining is large, so prep is almost always `deferrable`.
 *
 * Pure (the clock is the injected `now`), so § 7's edge cases are reproducible.
 */

import type { RecommendationConfig } from "./config";
import { minutesUntilMeal } from "./mealtimes";
import type { CandidateDish, MealSlot } from "./types";

export type PrepOutcome = "none" | "deferrable" | "impossible";

export interface PrepFeasibility {
  outcome: PrepOutcome;
  /** The longest `required_before_minutes` across the dish's prep tasks (0 if none). */
  maxLeadMinutes: number;
  /** Minutes from `now` to the slot's mealtime on `date`. */
  minutesUntilMeal: number;
}

/** Classify a dish's prep feasibility for a slot at `now` (design/05 § 7). */
export function prepFeasibility(
  dish: CandidateDish,
  date: string,
  mealSlot: MealSlot,
  now: Date,
  config: RecommendationConfig,
): PrepFeasibility {
  const minsUntil = minutesUntilMeal(date, mealSlot, now, config);

  if (dish.prepTasks.length === 0) {
    return { outcome: "none", maxLeadMinutes: 0, minutesUntilMeal: minsUntil };
  }

  const maxLead = dish.prepTasks.reduce(
    (max, task) => Math.max(max, task.requiredBeforeMinutes),
    0,
  );

  const outcome: PrepOutcome =
    maxLead <= minsUntil ? "deferrable" : "impossible";
  return { outcome, maxLeadMinutes: maxLead, minutesUntilMeal: minsUntil };
}
