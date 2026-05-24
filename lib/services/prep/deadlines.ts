/**
 * Prep-task deadline computation — the pure core of advance-prep reminders
 * (design/08 § 11, P7-4). I/O-free and `server-only`-free so it is unit-testable
 * and the DTO types are safe to `import type` from client components.
 *
 * For each upcoming planned dish with `dish_prep_tasks`, the meal datetime is the
 * dish's date + the slot mealtime, and the prep deadline is
 *   `prepDeadline = mealDatetime − required_before_minutes`.
 *
 * Mealtimes come from the recommendation engine's config (UTC `HH:MM` per slot),
 * reusing `mealtimeUtcMs` so prep feasibility (design/05 § 7) and prep reminders
 * agree on "when is dinner". The schema stores no household timezone, so this is
 * UTC — the same documented MVP simplification as the recommender
 * (`lib/recommendation/config.ts`); per-household tz is a V2 concern.
 */

import {
  RECOMMENDATION_CONFIG,
  type RecommendationConfig,
} from "@/lib/recommendation";
import { mealtimeUtcMs } from "@/lib/recommendation/mealtimes";
import type { MealSlot } from "@/lib/services/meal-plan/validate";

/** One upcoming planned-dish prep task, before the deadline is computed. */
export interface UpcomingPrepInput {
  mealPlanItemId: string;
  date: string;
  mealSlot: MealSlot;
  dishId: string;
  dishName: string;
  taskName: string;
  description: string | null;
  requiredBeforeMinutes: number;
}

/** A derived prep reminder for the dashboard (design/08 § 11). */
export interface PrepReminderDto {
  mealPlanItemId: string;
  dishId: string;
  dishName: string;
  taskName: string;
  description: string | null;
  date: string;
  mealSlot: MealSlot;
  /** ISO-8601 (UTC) instant prep must start by. */
  prepDeadline: string;
  /** True when the deadline is already in the past relative to `now`. */
  overdue: boolean;
}

/**
 * Compute each input's prep deadline and overdue flag, sorted earliest-deadline
 * first (the dashboard order, design/08 § 11). Pure: the only clock is `now`.
 */
export function computePrepReminders(
  inputs: readonly UpcomingPrepInput[],
  now: Date,
  config: RecommendationConfig = RECOMMENDATION_CONFIG,
): PrepReminderDto[] {
  const nowMs = now.getTime();

  const reminders = inputs.map((input) => {
    const deadlineMs =
      mealtimeUtcMs(input.date, input.mealSlot, config) -
      input.requiredBeforeMinutes * 60_000;
    return {
      mealPlanItemId: input.mealPlanItemId,
      dishId: input.dishId,
      dishName: input.dishName,
      taskName: input.taskName,
      description: input.description,
      date: input.date,
      mealSlot: input.mealSlot,
      prepDeadline: new Date(deadlineMs).toISOString(),
      overdue: deadlineMs < nowMs,
    };
  });

  reminders.sort((a, b) => a.prepDeadline.localeCompare(b.prepDeadline));
  return reminders;
}
