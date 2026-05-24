/**
 * Date/mealtime helpers for prep feasibility (design/05 § 7) and the weekday/
 * weekend split (§3.1, §5).
 *
 * Everything is computed in **UTC** from a `YYYY-MM-DD` date string and the
 * config's `HH:MM` mealtimes, so results are deterministic and independent of
 * the test runner's local timezone. The MVP has no household timezone (a P7
 * concern), so UTC is the documented simplification (see `config.ts`). Pure, no
 * I/O beyond the injected `now`.
 */

import type { RecommendationConfig } from "./config";
import type { MealSlot } from "./types";

/** True for Saturday/Sunday (UTC) — selects the weekend cooking-time limit. */
export function isWeekend(date: string): boolean {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay();
  return day === 0 || day === 6;
}

/** Epoch ms of the slot's mealtime on `date` (UTC), per the config mealtimes. */
export function mealtimeUtcMs(
  date: string,
  mealSlot: MealSlot,
  config: RecommendationConfig,
): number {
  return Date.parse(`${date}T${config.mealtimes[mealSlot]}:00Z`);
}

/**
 * Minutes from `now` until the slot's mealtime on `date`. Negative once the
 * mealtime has passed; large and positive for future-dated planning (so prep is
 * almost always feasible then, design/05 § 7).
 */
export function minutesUntilMeal(
  date: string,
  mealSlot: MealSlot,
  now: Date,
  config: RecommendationConfig,
): number {
  return (mealtimeUtcMs(date, mealSlot, config) - now.getTime()) / 60000;
}
