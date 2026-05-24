import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { getActiveMembership } from "@/lib/auth";
import type { Database } from "@/lib/db/database.types";
import { createServerSupabaseClient } from "@/lib/db/server";
import { InternalError, NotFoundError } from "@/lib/errors";
import type { MealSlot } from "@/lib/services/meal-plan/validate";
import { isUuid } from "@/lib/validation";

import {
  computePrepReminders,
  type PrepReminderDto,
  type UpcomingPrepInput,
} from "./deadlines";

/**
 * `prep` service — the dashboard's upcoming-prep derivation (design/08 § 11,
 * P7-4/P7-5). Member-gated read (404 for a non-member, existence-hiding); the
 * deadline math is the pure `computePrepReminders`. This is the always-available
 * MVP delivery path (the `prep_reminders` cron job, P7-6, is the separate
 * inbox/notification path).
 *
 * Reads run under the per-request RLS client; `dish_prep_tasks`/`dishes` are
 * RLS-scoped to ACTIVE dishes, so an archived planned dish yields no reminders —
 * acceptable since upcoming planned dishes are active (the recommender only
 * plans active dishes).
 */

type ServerClient = SupabaseClient<Database>;

/** How many days ahead the dashboard looks for prep deadlines (design/08 § 11: ~48h). */
const DEFAULT_WITHIN_DAYS = 2;

interface ItemRow {
  id: string;
  date: string;
  meal_slot: MealSlot;
  dish_id: string;
  dishes: { name: string } | null;
}

interface PrepTaskRow {
  dish_id: string;
  task_name: string;
  required_before_minutes: number;
  description: string | null;
}

/**
 * Upcoming prep reminders for the household's planned dishes, sorted by deadline
 * (design/08 § 11). Returns `[]` when nothing in the window needs prep.
 */
export async function getUpcomingPrepTasks(
  householdId: string,
  options: { now?: Date; withinDays?: number } = {},
): Promise<PrepReminderDto[]> {
  if (!isUuid(householdId)) throw new NotFoundError("Household not found.");
  const membership = await getActiveMembership(householdId);
  if (!membership) throw new NotFoundError("Household not found.");

  const now = options.now ?? new Date();
  const today = now.toISOString().slice(0, 10);
  const endDate = addDays(today, options.withinDays ?? DEFAULT_WITHIN_DAYS);

  const supabase = await createServerSupabaseClient();
  const items = await loadUpcomingItems(supabase, householdId, today, endDate);
  if (items.length === 0) return [];

  const prepByDish = await loadPrepTasks(
    supabase,
    items.map((i) => i.dish_id),
  );

  const inputs: UpcomingPrepInput[] = [];
  for (const item of items) {
    for (const task of prepByDish.get(item.dish_id) ?? []) {
      inputs.push({
        mealPlanItemId: item.id,
        date: item.date,
        mealSlot: item.meal_slot,
        dishId: item.dish_id,
        dishName: item.dishes?.name ?? "Planned dish",
        taskName: task.task_name,
        description: task.description,
        requiredBeforeMinutes: task.required_before_minutes,
      });
    }
  }

  return computePrepReminders(inputs, now);
}

async function loadUpcomingItems(
  supabase: ServerClient,
  householdId: string,
  today: string,
  endDate: string,
): Promise<ItemRow[]> {
  const { data, error } = await supabase
    .from("meal_plan_items")
    .select("id, date, meal_slot, dish_id, dishes(name)")
    .eq("household_id", householdId)
    .gte("date", today)
    .lte("date", endDate)
    .not("dish_id", "is", null)
    .not("status", "in", "(eating_out,skipped)");
  if (error) {
    throw new InternalError("Failed to load upcoming meals.", { cause: error });
  }
  return ((data ?? []) as unknown as ItemRow[]).filter(
    (row) => row.dish_id !== null,
  );
}

async function loadPrepTasks(
  supabase: ServerClient,
  dishIds: readonly string[],
): Promise<Map<string, PrepTaskRow[]>> {
  const byDish = new Map<string, PrepTaskRow[]>();
  const distinct = [...new Set(dishIds)];
  if (distinct.length === 0) return byDish;

  const { data, error } = await supabase
    .from("dish_prep_tasks")
    .select("dish_id, task_name, required_before_minutes, description")
    .in("dish_id", distinct);
  if (error) {
    throw new InternalError("Failed to load prep tasks.", { cause: error });
  }
  for (const row of (data ?? []) as PrepTaskRow[]) {
    const list = byDish.get(row.dish_id);
    if (list) list.push(row);
    else byDish.set(row.dish_id, [row]);
  }
  return byDish;
}

/** `date` + `days` calendar days as `YYYY-MM-DD` (UTC). */
function addDays(date: string, days: number): string {
  const ms = Date.parse(`${date}T00:00:00Z`) + days * 86_400_000;
  return new Date(ms).toISOString().slice(0, 10);
}
