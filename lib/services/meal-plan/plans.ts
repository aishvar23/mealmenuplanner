import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/db/database.types";
import { ConflictError, InternalError } from "@/lib/errors";

/**
 * `meal_plans` row resolution (design/08 § 2 step 1, § 3). A plan is the date
 * range a household's items hang off; "today" generation creates a one-day plan
 * if none covers the date, and weekly generation creates/extends a plan keyed to
 * its `start_date`. All writes run under the per-request RLS client (the
 * `mp_insert`/`mp_update` policies require a `can_change_*` flag, which the
 * service already gated).
 */

type ServerClient = SupabaseClient<Database>;

const PG_UNIQUE_VIOLATION = "23505";

const PLAN_SELECT = "id, status, start_date, end_date";

export interface ResolvedPlan {
  id: string;
  status: Database["public"]["Enums"]["meal_plan_status"];
  start_date: string;
  end_date: string;
}

/**
 * Find the `active` plan covering `date`, else create a one-day plan
 * (`start_date = end_date = date`). Returns the plan id (design/08 § 2 step 1).
 */
export async function resolveOrCreateDayPlan(
  supabase: ServerClient,
  householdId: string,
  date: string,
  userId: string,
): Promise<ResolvedPlan> {
  const { data: existing, error } = await supabase
    .from("meal_plans")
    .select(PLAN_SELECT)
    .eq("household_id", householdId)
    .eq("status", "active")
    .lte("start_date", date)
    .gte("end_date", date)
    .order("start_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new InternalError("Failed to resolve meal plan.", { cause: error });
  }
  if (existing) return existing;

  return insertActivePlan(supabase, householdId, date, date, userId);
}

/**
 * Find (or create) the `active` plan for the weekly range, extending its
 * `end_date` if a plan already starts on `startDate` but ends earlier
 * (design/08 § 3). Keyed to `start_date` to respect `uq_active_plan_per_start`.
 */
export async function resolveOrCreateRangePlan(
  supabase: ServerClient,
  householdId: string,
  startDate: string,
  endDate: string,
  userId: string,
): Promise<ResolvedPlan> {
  const { data: existing, error } = await supabase
    .from("meal_plans")
    .select(PLAN_SELECT)
    .eq("household_id", householdId)
    .eq("status", "active")
    .eq("start_date", startDate)
    .maybeSingle();

  if (error) {
    throw new InternalError("Failed to resolve meal plan.", { cause: error });
  }

  if (existing) {
    if (existing.end_date >= endDate) return existing;
    // Extend the window so the new cells fall inside the plan's range.
    const { data: extended, error: updateError } = await supabase
      .from("meal_plans")
      .update({ end_date: endDate })
      .eq("id", existing.id)
      .select(PLAN_SELECT)
      .maybeSingle();
    if (updateError || !extended) {
      throw new InternalError("Failed to extend meal plan range.", {
        cause: updateError,
      });
    }
    return extended;
  }

  return insertActivePlan(supabase, householdId, startDate, endDate, userId);
}

/**
 * Insert a new `active` plan; on a `uq_active_plan_per_start` race (a concurrent
 * generate created the plan first), re-read and reuse it rather than failing.
 */
async function insertActivePlan(
  supabase: ServerClient,
  householdId: string,
  startDate: string,
  endDate: string,
  userId: string,
): Promise<ResolvedPlan> {
  const { data, error } = await supabase
    .from("meal_plans")
    .insert({
      household_id: householdId,
      start_date: startDate,
      end_date: endDate,
      status: "active",
      generated_by_user_id: userId,
    })
    .select(PLAN_SELECT)
    .maybeSingle();

  if (error) {
    if (error.code === PG_UNIQUE_VIOLATION) {
      const { data: raced } = await supabase
        .from("meal_plans")
        .select(PLAN_SELECT)
        .eq("household_id", householdId)
        .eq("status", "active")
        .eq("start_date", startDate)
        .maybeSingle();
      if (raced) return raced;
      throw new ConflictError("An active plan already covers that date.", {
        reason: "active_plan_exists",
      });
    }
    throw new InternalError("Failed to create meal plan.", { cause: error });
  }
  if (!data) {
    throw new InternalError("Failed to create meal plan.");
  }
  return data;
}
