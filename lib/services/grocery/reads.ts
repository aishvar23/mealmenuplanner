import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { getActiveMembership } from "@/lib/auth";
import type { Database } from "@/lib/db/database.types";
import { createServerSupabaseClient } from "@/lib/db/server";
import { InternalError, NotFoundError } from "@/lib/errors";
import { categoryRank } from "@/lib/grocery/labels";
import { isUuid } from "@/lib/validation";

import {
  toGroceryListDto,
  type GroceryItemRow,
  type GroceryListDto,
  type GroceryListRow,
} from "./dto";
import { validateMealPlanId } from "./validate";

/**
 * `grocery` service reads (design/04 § 4.6, P7-2). Member-gated: a non-member (or
 * expired guest) gets `NotFoundError` (existence-hiding, design/04 § 2); RLS
 * (`gl_select`/`gli_select`) is the backstop. Reads run under the per-request
 * client. The grocery screen renders these server-side and mutates through the
 * regenerate / check-off endpoints.
 */

type ServerClient = SupabaseClient<Database>;

const LIST_SELECT = "id, meal_plan_id, status";
const ITEM_SELECT =
  "id, ingredient_id, name, category, quantity, unit, checked";

/** A resolved plan for the grocery screen. */
export interface GroceryPlanRef {
  mealPlanId: string;
  startDate: string;
  endDate: string;
}

/** What the grocery screen needs server-side: the current plan + its list (if any). */
export interface GroceryScreen {
  plan: GroceryPlanRef | null;
  /** Null when no plan, or a plan with no list generated yet. */
  list: GroceryListDto | null;
}

/**
 * Resolve the grocery screen's data in one member-gated call (P7-2): the current
 * plan (see {@link resolveCurrentPlanForGrocery}) and its grocery list if one
 * exists. Keeps the page component thin (no client wiring). 404s a non-member.
 */
export async function getGroceryScreen(
  householdId: string,
  now: Date = new Date(),
): Promise<GroceryScreen> {
  if (!isUuid(householdId)) throw new NotFoundError("Household not found.");
  const membership = await getActiveMembership(householdId);
  if (!membership) throw new NotFoundError("Household not found.");

  const supabase = await createServerSupabaseClient();
  const today = now.toISOString().slice(0, 10);
  const plan = await resolveCurrentPlanForGrocery(supabase, householdId, today);
  if (!plan) return { plan: null, list: null };

  const list = await readGroceryListByPlan(
    supabase,
    householdId,
    plan.mealPlanId,
  );
  return { plan, list };
}

/**
 * `GET /api/households/{id}/grocery-list?mealPlanId=…` (design/04 § 4.6). Returns
 * the one list for the plan, its items ordered by category then name. 404s a
 * non-member or a plan with no list yet.
 */
export async function getGroceryList(
  householdId: string,
  mealPlanId: string,
): Promise<GroceryListDto> {
  if (!isUuid(householdId)) throw new NotFoundError("Household not found.");
  validateMealPlanId(mealPlanId);

  const membership = await getActiveMembership(householdId);
  if (!membership) throw new NotFoundError("Household not found.");

  const supabase = await createServerSupabaseClient();
  const list = await readGroceryListByPlan(supabase, householdId, mealPlanId);
  if (!list) {
    throw new NotFoundError("No grocery list for that plan yet.");
  }
  return list;
}

/**
 * Read the plan's grocery list + items as a DTO, or `null` if no list exists.
 * Shared by {@link getGroceryList} and the regenerate re-read. Scoped to the
 * household so a cross-household `mealPlanId` cannot resolve a list.
 */
export async function readGroceryListByPlan(
  supabase: ServerClient,
  householdId: string,
  mealPlanId: string,
): Promise<GroceryListDto | null> {
  const { data: list, error } = await supabase
    .from("grocery_lists")
    .select(LIST_SELECT)
    .eq("household_id", householdId)
    .eq("meal_plan_id", mealPlanId)
    .maybeSingle();
  if (error) {
    throw new InternalError("Failed to load the grocery list.", {
      cause: error,
    });
  }
  if (!list) return null;

  const { data: items, error: itemsError } = await supabase
    .from("grocery_list_items")
    .select(ITEM_SELECT)
    .eq("grocery_list_id", list.id);
  if (itemsError) {
    throw new InternalError("Failed to load grocery items.", {
      cause: itemsError,
    });
  }

  const ordered = (items ?? []).slice().sort(orderByCategoryThenName);
  return toGroceryListDto(list as GroceryListRow, ordered as GroceryItemRow[]);
}

/**
 * Resolve the plan whose grocery list the screen should show: the active plan
 * that currently covers `today` (preferring the longest horizon when a one-day
 * and a weekly plan overlap), else the most recently started active plan, else
 * `null`. A household switcher / explicit plan picker is a future enhancement.
 */
export async function resolveCurrentPlanForGrocery(
  supabase: ServerClient,
  householdId: string,
  today: string,
): Promise<GroceryPlanRef | null> {
  const { data, error } = await supabase
    .from("meal_plans")
    .select("id, start_date, end_date")
    .eq("household_id", householdId)
    .eq("status", "active")
    .order("start_date", { ascending: false });
  if (error) {
    throw new InternalError("Failed to resolve the current plan.", {
      cause: error,
    });
  }
  const plans = data ?? [];
  if (plans.length === 0) return null;

  const span = (p: { start_date: string; end_date: string }) =>
    Date.parse(p.end_date) - Date.parse(p.start_date);

  const covering = plans
    .filter((p) => p.start_date <= today && p.end_date >= today)
    .sort((a, b) => span(b) - span(a));

  const chosen = covering[0] ?? plans[0];
  if (!chosen) return null;
  return {
    mealPlanId: chosen.id,
    startDate: chosen.start_date,
    endDate: chosen.end_date,
  };
}

/** Category order (doc-01 display order), then name, then unit — matches the aggregator. */
function orderByCategoryThenName(a: GroceryItemRow, b: GroceryItemRow): number {
  return (
    categoryRank(a.category) - categoryRank(b.category) ||
    a.category.localeCompare(b.category) ||
    a.name.localeCompare(b.name) ||
    a.unit.localeCompare(b.unit)
  );
}
