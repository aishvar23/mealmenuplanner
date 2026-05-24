import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { getActiveMembership, hasPermission } from "@/lib/auth";
import type { Database, Json } from "@/lib/db/database.types";
import { createServerSupabaseClient } from "@/lib/db/server";
import { ForbiddenError, InternalError, NotFoundError } from "@/lib/errors";
import { isUuid } from "@/lib/validation";

import { aggregateGroceryLines } from "./aggregate";
import type { GroceryListDto } from "./dto";
import {
  loadDishIngredientLines,
  loadFamilySize,
  loadPlannedDishIds,
} from "./load";
import { readGroceryListByPlan } from "./reads";
import { validateMealPlanId } from "./validate";

/**
 * `grocery` service — list (re)generation (design/08 § 9/§ 10, P7-1/P7-3). The
 * grocery list is a derived projection of a plan's items; this rebuilds it
 * idempotently. Aggregation is pure (`aggregate.ts`); the write is the
 * `replace_grocery_list` SECURITY DEFINER RPC (re-checks active membership,
 * upserts the one list per plan, delete + re-inserts items — design/08 § 10).
 *
 * Two entry points:
 *   - {@link regenerateGroceryList} — the explicit endpoint, gated by
 *     `can_manage_grocery_list` (design/04 § 4.6).
 *   - {@link regenerateGroceryListForPlan} — the engine, called as a SIDE EFFECT
 *     of a permitted plan change (today/week generate, replace, eating-out) via
 *     the best-effort {@link safeRegenerateGroceryListForPlan}. The actor there
 *     already passed the meal-change gate; the RPC's membership check is the
 *     authorization, so a missing grocery flag doesn't desync the list.
 */

type ServerClient = SupabaseClient<Database>;

const PG_NOT_FOUND = "P0002";

/**
 * Rebuild the plan's grocery list and return it (design/08 § 9). Loads inputs
 * under the passed per-request client, aggregates, writes via the RPC, and
 * re-reads the persisted list (so the response carries real item ids + reset
 * `checked`). The caller is responsible for authorization.
 */
export async function regenerateGroceryListForPlan(
  supabase: ServerClient,
  householdId: string,
  mealPlanId: string,
): Promise<GroceryListDto> {
  const familySize = await loadFamilySize(supabase, householdId);
  const plannedDishIds = await loadPlannedDishIds(supabase, mealPlanId);
  const ingredientsByDish = await loadDishIngredientLines(
    supabase,
    plannedDishIds,
  );

  const lines = aggregateGroceryLines(
    plannedDishIds,
    ingredientsByDish,
    familySize,
  );

  const { error } = await supabase.rpc("replace_grocery_list", {
    p_meal_plan_id: mealPlanId,
    p_items: lines as unknown as Json,
  });
  if (error) {
    if (error.code === PG_NOT_FOUND) {
      throw new NotFoundError("Meal plan not found.");
    }
    throw new InternalError("Failed to regenerate the grocery list.", {
      cause: error,
    });
  }

  const list = await readGroceryListByPlan(supabase, householdId, mealPlanId);
  if (!list) {
    throw new InternalError("Grocery list disappeared after regeneration.");
  }
  return list;
}

/**
 * `POST /api/households/{id}/grocery-list/regenerate` (design/04 § 4.6). Gated by
 * `can_manage_grocery_list`: a non-member → 404 (existence-hiding), a member
 * without the flag → 403. Verifies the plan is in the caller's household before
 * regenerating.
 */
export async function regenerateGroceryList(
  householdId: string,
  mealPlanId: string,
): Promise<GroceryListDto> {
  if (!isUuid(householdId)) throw new NotFoundError("Household not found.");
  validateMealPlanId(mealPlanId);

  const membership = await getActiveMembership(householdId);
  if (!membership) throw new NotFoundError("Household not found.");
  if (!hasPermission(membership, "can_manage_grocery_list")) {
    throw new ForbiddenError(
      "You don't have permission to manage the grocery list.",
    );
  }

  const supabase = await createServerSupabaseClient();

  // Confirm the plan belongs to this household (else a cross-household id would
  // 404 only at the RPC) — keeps the existence-hiding boundary tight.
  const { data: plan, error } = await supabase
    .from("meal_plans")
    .select("id")
    .eq("id", mealPlanId)
    .eq("household_id", householdId)
    .maybeSingle();
  if (error) {
    throw new InternalError("Failed to load the meal plan.", { cause: error });
  }
  if (!plan) throw new NotFoundError("Meal plan not found.");

  return regenerateGroceryListForPlan(supabase, householdId, mealPlanId);
}

/**
 * Best-effort side-effect regeneration after a plan change (design/08 § 10). A
 * grocery failure must never fail the meal mutation that triggered it (the meal
 * change is already persisted and is the primary action), so errors are logged,
 * not thrown. Reuses the caller's per-request client.
 */
export async function safeRegenerateGroceryListForPlan(
  supabase: ServerClient,
  householdId: string,
  mealPlanId: string,
): Promise<void> {
  try {
    await regenerateGroceryListForPlan(supabase, householdId, mealPlanId);
  } catch (cause) {
    console.error(
      `[grocery] regeneration failed for plan ${mealPlanId}:`,
      cause,
    );
  }
}

/**
 * Regenerate every existing grocery list for the household's ACTIVE plans
 * (design/08 § 10 `family_size` trigger). Only plans that already have a list are
 * touched — a family-size change rescales current shopping, it does not create
 * lists for plans the user never generated one for. Best-effort per plan.
 */
export async function regenerateExistingGroceryListsForHousehold(
  supabase: ServerClient,
  householdId: string,
): Promise<void> {
  const { data, error } = await supabase
    .from("grocery_lists")
    .select("meal_plan_id, meal_plans(status)")
    .eq("household_id", householdId);
  if (error) {
    console.error(
      `[grocery] failed to list grocery lists for household ${householdId}:`,
      error,
    );
    return;
  }

  for (const row of data ?? []) {
    const status = (row.meal_plans as { status: string } | null)?.status;
    if (status !== "active") continue;
    await safeRegenerateGroceryListForPlan(
      supabase,
      householdId,
      row.meal_plan_id,
    );
  }
}
