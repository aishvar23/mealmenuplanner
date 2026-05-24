import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  getActiveMembership,
  hasPermission,
  requireAuthUser,
  type Permission,
} from "@/lib/auth";
import type { Database } from "@/lib/db/database.types";
import { createServerSupabaseClient } from "@/lib/db/server";
import { ForbiddenError, InternalError, NotFoundError } from "@/lib/errors";
import { isUuid } from "@/lib/validation";

/**
 * Shared authorization helpers for the `mealPlan` service. They implement
 * design/04 § 2's FORBIDDEN-vs-NOT_FOUND policy uniformly:
 *   - not an active member (or expired guest) → `NotFoundError` (404), so we
 *     never reveal a household / meal exists across the tenancy boundary;
 *   - an active member who lacks the required `can_*` flag → `ForbiddenError`
 *     (403), since the resource is known to be in their household.
 * RLS (`mpi_*`, `mp_*` policies, P0-12) independently re-checks the same flag on
 * every write as the backstop.
 */

type ServerClient = SupabaseClient<Database>;

/** The `meal_plan_items` columns every item action reads, with the joined dish name. */
export const ITEM_ACTION_SELECT =
  "id, household_id, meal_plan_id, date, meal_slot, dish_id, status, locked, reason, changed_by_user_id, dishes(name)";

/** One `meal_plan_items` row loaded for an action (shape of `ITEM_ACTION_SELECT`). */
export interface ActionItemRow {
  id: string;
  household_id: string;
  meal_plan_id: string;
  date: string;
  meal_slot: Database["public"]["Enums"]["meal_slot"];
  dish_id: string | null;
  status: Database["public"]["Enums"]["meal_item_status"];
  locked: boolean;
  reason: string | null;
  changed_by_user_id: string | null;
  dishes: { name: string } | null;
}

/**
 * Gate a household-scoped action: validate the id, require active membership
 * (else 404), and require `permission` (else 403). Returns nothing useful beyond
 * the membership having been confirmed — callers proceed under the per-request
 * RLS client they create themselves.
 */
export async function requireHouseholdPermission(
  householdId: string,
  permission: Permission,
  forbiddenMessage: string,
): Promise<void> {
  if (!isUuid(householdId)) throw new NotFoundError("Household not found.");

  const membership = await getActiveMembership(householdId);
  if (!membership) throw new NotFoundError("Household not found.");
  if (!hasPermission(membership, permission)) {
    throw new ForbiddenError(forbiddenMessage);
  }
}

/**
 * Load a `meal_plan_items` row by id for an action and authorize the caller.
 * Top-level item endpoints resolve the household from the row itself (design/04
 * § 1). A row hidden by RLS (`mpi_select` requires active membership) reads back
 * as `null` → `NotFoundError`, giving existence-hiding for free.
 *
 * The permission is **date-aware** (design/08 § 5): a past/today cell needs
 * `can_change_today_menu`; a future cell needs `can_change_weekly_schedule`. This
 * mirrors the (today OR weekly) `mpi_update` RLS backstop while being precise
 * about which flag actually applies to the cell being changed.
 */
export async function loadItemForAction(
  itemId: string,
  now: Date = new Date(),
): Promise<{ supabase: ServerClient; item: ActionItemRow }> {
  // Establish a verified session first so an unauthenticated caller gets a
  // consistent 401 (not a 404 from an empty RLS read), matching the other actions.
  await requireAuthUser();

  if (!isUuid(itemId)) throw new NotFoundError("Meal not found.");

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("meal_plan_items")
    .select(ITEM_ACTION_SELECT)
    .eq("id", itemId)
    .maybeSingle();

  if (error) {
    throw new InternalError("Failed to load meal plan item.", { cause: error });
  }
  const item = data as unknown as ActionItemRow | null;
  if (!item) throw new NotFoundError("Meal not found.");

  const membership = await getActiveMembership(item.household_id);
  if (!membership) throw new NotFoundError("Meal not found.");

  const today = now.toISOString().slice(0, 10);
  const permission: Permission =
    item.date > today ? "can_change_weekly_schedule" : "can_change_today_menu";
  if (!hasPermission(membership, permission)) {
    throw new ForbiddenError("You don't have permission to change this meal.");
  }

  return { supabase, item };
}
