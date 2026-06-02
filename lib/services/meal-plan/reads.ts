import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { getActiveMembership } from "@/lib/auth";
import type { Database } from "@/lib/db/database.types";
import { createServerSupabaseClient } from "@/lib/db/server";
import { InternalError, NotFoundError } from "@/lib/errors";
import { isUuid } from "@/lib/validation";

import {
  toMealPlanItemDto,
  type MealPlanItemDto,
  type MealPlanItemRow,
} from "./dto";
import { attachPackages } from "./packaging";
import type { MealSlot } from "./validate";

/**
 * `mealPlan` service — read projections for the Today, Plan, and History screens
 * (P5-1/P5-3/P5-7). All are member-gated reads: a non-member (or expired guest)
 * gets `NotFoundError` (existence-hiding, design/04 § 2), and RLS (`mpi_select`)
 * is the backstop. The screens render these server-side; the client components
 * mutate through the action endpoints and re-fetch.
 */

type ServerClient = SupabaseClient<Database>;

const READ_SELECT =
  "id, meal_plan_id, date, meal_slot, dish_id, status, locked, reason, eating_out_note, changed_by_user_id, dishes(name, image_url, image_alt_text, image_status, serving_qty, serving_unit, calories_kcal, protein_g, carbs_g, fat_g, glycemic_index)";

/** Canonical slot display order (doc 01 `meal_slot` enum order). */
const SLOT_ORDER: Record<MealSlot, number> = {
  breakfast: 0,
  lunch: 1,
  dinner: 2,
  snack: 3,
};

/** Today's (or any single day's) planned items, ordered by slot (P5-1). */
export async function getDayPlan(
  householdId: string,
  date: string,
): Promise<{ date: string; items: MealPlanItemDto[] }> {
  const supabase = await gateRead(householdId);

  const { data, error } = await supabase
    .from("meal_plan_items")
    .select(READ_SELECT)
    .eq("household_id", householdId)
    .eq("date", date);
  if (error) {
    throw new InternalError("Failed to load the day's plan.", { cause: error });
  }

  const items = sortBySlot(mapRows(data));
  // Round each planned main into its display package (design/08 criterion 10).
  await attachPackages(supabase, items);
  return { date, items };
}

/** A date range of planned items, ordered by date then slot (P5-3). */
export async function getWeekPlan(
  householdId: string,
  startDate: string,
  endDate: string,
): Promise<{ startDate: string; endDate: string; items: MealPlanItemDto[] }> {
  const supabase = await gateRead(householdId);

  const { data, error } = await supabase
    .from("meal_plan_items")
    .select(READ_SELECT)
    .eq("household_id", householdId)
    .gte("date", startDate)
    .lte("date", endDate);
  if (error) {
    throw new InternalError("Failed to load the weekly plan.", {
      cause: error,
    });
  }

  const items = mapRows(data).sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      SLOT_ORDER[a.mealSlot] - SLOT_ORDER[b.mealSlot],
  );
  await attachPackages(supabase, items);
  return { startDate, endDate, items };
}

/**
 * Past planned meals, most recent first (P5-7 meal history). Returns items
 * strictly before `before` (default: today, UTC), which the variety logic
 * derives from independently — this is the user-facing view of the same record.
 */
export async function listMealHistory(
  householdId: string,
  options: { before?: string; limit?: number } = {},
): Promise<MealPlanItemDto[]> {
  const supabase = await gateRead(householdId);
  const before = options.before ?? new Date().toISOString().slice(0, 10);
  const limit = Math.min(Math.max(options.limit ?? 30, 1), 100);

  const { data, error } = await supabase
    .from("meal_plan_items")
    .select(READ_SELECT)
    .eq("household_id", householdId)
    .lt("date", before)
    .order("date", { ascending: false })
    .limit(limit);
  if (error) {
    throw new InternalError("Failed to load meal history.", { cause: error });
  }

  return mapRows(data);
}

// ──────────────────────────────── helpers ────────────────────────────────

/** Validate the id, require active membership (404 otherwise), return the client. */
async function gateRead(householdId: string): Promise<ServerClient> {
  if (!isUuid(householdId)) throw new NotFoundError("Household not found.");
  const membership = await getActiveMembership(householdId);
  if (!membership) throw new NotFoundError("Household not found.");
  return createServerSupabaseClient();
}

function mapRows(data: unknown): MealPlanItemDto[] {
  return ((data ?? []) as unknown as MealPlanItemRow[]).map((row) =>
    toMealPlanItemDto(row),
  );
}

function sortBySlot(items: MealPlanItemDto[]): MealPlanItemDto[] {
  return items.sort((a, b) => SLOT_ORDER[a.mealSlot] - SLOT_ORDER[b.mealSlot]);
}
