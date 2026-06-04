import "server-only";

import { requireAuthUser } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/db/server";
import { actorDisplayName, safeEmitHouseholdEvent } from "@/lib/events";
import { InternalError, ValidationError } from "@/lib/errors";
import {
  RECOMMENDATION_CONFIG,
  recommendSlot,
  type Recommendation,
} from "@/lib/recommendation";
import { safeRegenerateGroceryListForPlan } from "@/lib/services/grocery";
import {
  loadActiveMembers,
  loadCandidateDishes,
  loadHouseholdContext,
  loadMealHistory,
  loadPopularCombinationDishIds,
} from "@/lib/services/recommendation";

import {
  ITEM_ACTION_SELECT,
  requireHouseholdPermission,
  type ActionItemRow,
} from "./access";
import {
  toMealPlanItemDto,
  type TodayGenerateResult,
  type WeekGenerateResult,
} from "./dto";
import { attachPackages } from "./packaging";
import { resolveOrCreateDayPlan, resolveOrCreateRangePlan } from "./plans";
import { suggestForSlot, toAlternatives } from "./suggest";
import { eachDateInRange, type MealSlot } from "./validate";

/**
 * `mealPlan` service — plan generation (design/08 § 2–3, P5-1/P5-3). It composes
 * the read-only recommendation engine (P4) with the `meal_plan_items` writes:
 * resolve the plan, run the deterministic recommender per slot, and persist the
 * picks under the per-request RLS client (gated by `can_change_*`). The engine
 * itself stays pure — this layer owns persistence.
 *
 * Grocery regeneration (design/08 § 9, P7) and the menu-change notifications
 * (design/09, P8) are triggered from here once those services exist; the hook
 * points are marked inline.
 */

// Postgres unique-violation SQLSTATE — recovered from on a concurrent cell race.
const PG_UNIQUE_VIOLATION = "23505";

const NO_PREFERENCES = () =>
  new ValidationError(
    "Set up your household preferences before generating meal suggestions.",
    [{ field: "preferences", rule: "required" }],
  );

/**
 * Generate (or re-suggest) one slot for `date` (design/08 § 2). Returns the
 * suggested item plus runner-up alternatives so the client can offer "Suggest
 * another" without a round trip. `excludeDishIds` powers suggest-another /
 * reject re-suggestion (the rejected dish is excluded from the candidate set).
 */
export async function generateToday(
  householdId: string,
  date: string,
  mealSlot: MealSlot,
  options: { excludeDishIds?: readonly string[]; now?: Date } = {},
): Promise<TodayGenerateResult> {
  await requireHouseholdPermission(
    householdId,
    "can_change_today_menu",
    "You don't have permission to change today's menu.",
  );
  const user = await requireAuthUser();
  const supabase = await createServerSupabaseClient();

  const plan = await resolveOrCreateDayPlan(
    supabase,
    householdId,
    date,
    user.id,
  );

  // Idempotency on the cell (design/08 § 2 step 2): one row per (plan,date,slot).
  const existing = await loadCell(supabase, plan.id, date, mealSlot);
  if (existing?.locked) {
    return finalizeTodayResult(supabase, {
      mealPlanId: plan.id,
      mealPlanItem: toMealPlanItemDto(existing),
      alternatives: [],
    });
  }
  if (existing?.status === "eating_out") {
    // Do not overwrite an eating-out slot — use replace / re-plan instead.
    return finalizeTodayResult(supabase, {
      mealPlanId: plan.id,
      mealPlanItem: toMealPlanItemDto(existing),
      alternatives: [],
    });
  }

  // Rank candidates (existence-hidden 404 if the caller isn't a member).
  const { recommendations, nameById, imageById, nutritionById, flagsById } =
    await suggestForSlot(householdId, date, mealSlot, {
      excludeDishIds: options.excludeDishIds,
      now: options.now,
    });
  const top = recommendations[0];

  // No eligible dish for the slot — leave the cell as-is (design/08 § 3 "no eligible dish").
  if (!top) {
    return finalizeTodayResult(supabase, {
      mealPlanId: plan.id,
      mealPlanItem: existing ? toMealPlanItemDto(existing) : null,
      alternatives: [],
    });
  }

  const saved = existing
    ? await updateCell(supabase, existing.id, top)
    : await insertCell(supabase, plan.id, householdId, date, mealSlot, top);

  // Grocery list is a derived projection — refresh it for the plan (design/08
  // § 9/§ 10, P7-3). Best-effort: a grocery glitch must not fail the suggestion.
  await safeRegenerateGroceryListForPlan(supabase, householdId, plan.id);

  return finalizeTodayResult(supabase, {
    mealPlanId: plan.id,
    mealPlanItem: toMealPlanItemDto(saved, {
      dishName: nameById.get(top.dishId) ?? null,
      dishImage: imageById.get(top.dishId) ?? null,
      // Leave undefined on a map miss so the joined row (if any) still wins,
      // rather than forcing a null that suppresses the fallback.
      nutrition: nutritionById.get(top.dishId) ?? undefined,
    }),
    alternatives: toAlternatives(
      recommendations.slice(1),
      nameById,
      imageById,
      nutritionById,
      flagsById,
    ),
  });
}

/**
 * Generate a weekly plan over `meals_to_plan` slots (design/08 § 3). Skips locked
 * and eating-out cells, excludes dishes already chosen in this run for variety,
 * and writes all picks in one bulk upsert. Returns the plan summary + item count.
 */
export async function generateWeek(
  householdId: string,
  startDate: string,
  endDate: string,
  options: { now?: Date } = {},
): Promise<WeekGenerateResult> {
  await requireHouseholdPermission(
    householdId,
    "can_change_weekly_schedule",
    "You don't have permission to change the weekly schedule.",
  );
  const user = await requireAuthUser();
  const supabase = await createServerSupabaseClient();

  const household = await loadHouseholdContext(supabase, householdId);
  if (!household) throw NO_PREFERENCES();

  const mealsToPlan = await loadMealsToPlan(supabase, householdId);
  const members = await loadActiveMembers(supabase, householdId);
  // History is loaded once relative to the start of the range; the in-run
  // `usedThisRun` exclusion (below) layers batch variety on top (design/08 § 3).
  const history = await loadMealHistory(
    supabase,
    householdId,
    startDate,
    household.varietyGapDays,
  );

  const dishesBySlot = new Map(
    await Promise.all(
      mealsToPlan.map(
        async (slot) =>
          [slot, await loadCandidateDishes(supabase, slot)] as const,
      ),
    ),
  );

  // P10: dishes in popular combinations lift their member dishes (popularDish).
  const popularCombinationDishIds = RECOMMENDATION_CONFIG.combinations.enabled
    ? await loadPopularCombinationDishIds(
        supabase,
        RECOMMENDATION_CONFIG.combinations.popularityThreshold,
      )
    : new Set<string>();

  const plan = await resolveOrCreateRangePlan(
    supabase,
    householdId,
    startDate,
    endDate,
    user.id,
  );
  const existing = await loadPlanCells(supabase, plan.id);

  const now = options.now ?? new Date();
  const usedThisRun = new Set<string>();
  type UpsertRow = {
    meal_plan_id: string;
    household_id: string;
    date: string;
    meal_slot: MealSlot;
    dish_id: string;
    status: "suggested";
    reason: string | null;
  };
  const rows: UpsertRow[] = [];

  for (const date of eachDateInRange(startDate, endDate)) {
    for (const slot of mealsToPlan) {
      const cell = existing.get(cellKey(date, slot));
      if (cell?.locked) {
        if (cell.dish_id) usedThisRun.add(cell.dish_id);
        continue; // locked cells are never regenerated (design/08 § 7)
      }
      if (cell?.status === "eating_out") continue; // no dish for this slot

      const candidates = (dishesBySlot.get(slot) ?? []).filter(
        (d) => !usedThisRun.has(d.id),
      );
      const recommendations = recommendSlot({
        household,
        members,
        dishes: candidates,
        history,
        date,
        mealSlot: slot,
        now,
        popularCombinationDishIds,
      });
      const top = recommendations[0];
      if (!top) continue; // leave the slot empty — no eligible dish

      rows.push({
        meal_plan_id: plan.id,
        household_id: householdId,
        date,
        meal_slot: slot,
        dish_id: top.dishId,
        status: "suggested",
        reason: top.reason,
      });
      usedThisRun.add(top.dishId);
    }
  }

  if (rows.length > 0) {
    const { error } = await supabase
      .from("meal_plan_items")
      .upsert(rows, { onConflict: "meal_plan_id,date,meal_slot" });
    if (error) {
      throw new InternalError("Failed to write weekly plan items.", {
        cause: error,
      });
    }
  }

  // Refresh the derived grocery list once for the whole week (design/08 § 9, P7-3)
  // when anything changed. Best-effort so a grocery glitch doesn't fail the plan.
  if (rows.length > 0) {
    await safeRegenerateGroceryListForPlan(supabase, householdId, plan.id);
    // A new/updated weekly plan → tell the household (design/09 § 2).
    await safeEmitHouseholdEvent(supabase, {
      householdId,
      eventType: "weekly_plan_generated",
      entityType: "meal_plan",
      entityId: plan.id,
      newValue: { startDate, endDate, itemCount: rows.length },
      vars: { actorName: actorDisplayName(user) },
    });
  }

  const itemCount = await countPlanItems(supabase, plan.id);
  return {
    mealPlanId: plan.id,
    status: plan.status,
    startDate: plan.start_date,
    endDate: plan.end_date,
    itemCount,
  };
}

/**
 * Pre-fill any empty planned slot for `date` with the engine's top pick, so the
 * Today screen always opens with a suggestion in every slot — never a blank card
 * (product vision: "Approve today's meals"). Idempotent and silent:
 *
 *  - Only the `slots` passed in are considered, and a slot is filled only when
 *    it is still empty. A slot that already holds a dish, is locked, or is
 *    marked eating-out is left untouched, so a reload or a second viewer never
 *    overwrites a real choice — and a second visit finds everything filled and
 *    does nothing.
 *  - Picks are deduplicated across the day (a dish chosen for one slot won't be
 *    re-suggested for another), mirroring weekly generation's `usedThisRun`.
 *  - Writes `suggested` rows awaiting the user's Approve, emits no household
 *    event (a pre-fill isn't a user decision), and refreshes the derived grocery
 *    list once if anything changed.
 *
 * Gated on `can_change_today_menu` like {@link generateToday}; the Today page
 * only calls it for members who can change the menu, so viewers/guests just see
 * whatever is already persisted.
 */
export async function ensureDaySuggestions(
  householdId: string,
  date: string,
  slots: readonly MealSlot[],
  options: { now?: Date } = {},
): Promise<void> {
  if (slots.length === 0) return;

  await requireHouseholdPermission(
    householdId,
    "can_change_today_menu",
    "You don't have permission to change today's menu.",
  );
  const user = await requireAuthUser();
  const supabase = await createServerSupabaseClient();

  const plan = await resolveOrCreateDayPlan(
    supabase,
    householdId,
    date,
    user.id,
  );
  const existing = await loadDayCells(supabase, plan.id, date);

  // Only the still-empty slots need a pick; respect any real state already in a
  // cell (a dish, a lock, or eating-out). Resolving this up front means we never
  // load any recommendation inputs when there's nothing to fill.
  const slotsToFill = slots.filter((slot) => {
    const cell = existing.get(slot);
    return !(cell?.locked || cell?.status === "eating_out" || cell?.dish_id);
  });
  if (slotsToFill.length === 0) return;

  // Load the slot-independent inputs ONCE (BUG-016 / PERF-003): before this, each
  // slot re-loaded the whole candidate universe (prefs, members, history, popular
  // combos) via `suggestForSlot` — an N+1 on the Today hot path. Mirror
  // `generateWeek`: load these once, load each slot's candidate dishes once, then
  // run the pure engine in-memory per slot with the cross-slot exclusion.
  const household = await loadHouseholdContext(supabase, householdId);
  if (!household) throw NO_PREFERENCES();

  const combinations = RECOMMENDATION_CONFIG.combinations;
  const [members, history, popularCombinationDishIds] = await Promise.all([
    loadActiveMembers(supabase, householdId),
    loadMealHistory(supabase, householdId, date, household.varietyGapDays),
    combinations.enabled
      ? loadPopularCombinationDishIds(
          supabase,
          combinations.popularityThreshold,
        )
      : Promise.resolve(new Set<string>()),
  ]);

  const dishesBySlot = new Map(
    await Promise.all(
      slotsToFill.map(
        async (slot) =>
          [slot, await loadCandidateDishes(supabase, slot)] as const,
      ),
    ),
  );

  // Seed the cross-slot exclusion with dishes already chosen for the day so a
  // pre-fill never duplicates one the user already sees in another slot.
  const now = options.now ?? new Date();
  const usedThisRun = new Set<string>();
  for (const cell of existing.values()) {
    if (cell.dish_id) usedThisRun.add(cell.dish_id);
  }

  type FillRow = {
    meal_plan_id: string;
    household_id: string;
    date: string;
    meal_slot: MealSlot;
    dish_id: string;
    status: "suggested";
    reason: string | null;
  };
  const rows: FillRow[] = [];

  for (const slot of slotsToFill) {
    const candidates = (dishesBySlot.get(slot) ?? []).filter(
      (d) => !usedThisRun.has(d.id),
    );
    const recommendations = recommendSlot({
      household,
      members,
      dishes: candidates,
      history,
      date,
      mealSlot: slot,
      now,
      popularCombinationDishIds,
    });
    const top = recommendations[0];
    if (!top) continue; // no eligible dish — leave the slot blank

    rows.push({
      meal_plan_id: plan.id,
      household_id: householdId,
      date,
      meal_slot: slot,
      dish_id: top.dishId,
      status: "suggested",
      reason: top.reason,
    });
    usedThisRun.add(top.dishId);
  }

  if (rows.length === 0) return;

  const { error } = await supabase
    .from("meal_plan_items")
    .upsert(rows, { onConflict: "meal_plan_id,date,meal_slot" });
  if (error) {
    throw new InternalError("Failed to pre-fill today's suggestions.", {
      cause: error,
    });
  }

  // Derived grocery list refresh, once for the day (design/08 § 9, P7-3).
  // Best-effort: a grocery glitch must not fail the pre-fill.
  await safeRegenerateGroceryListForPlan(supabase, householdId, plan.id);
}

// ──────────────────────────────── helpers ────────────────────────────────

/** This day's cells keyed by slot — the state {@link ensureDaySuggestions} respects. */
async function loadDayCells(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  planId: string,
  date: string,
): Promise<Map<MealSlot, Pick<PlanCell, "dish_id" | "status" | "locked">>> {
  const { data, error } = await supabase
    .from("meal_plan_items")
    .select("meal_slot, dish_id, status, locked")
    .eq("meal_plan_id", planId)
    .eq("date", date);
  if (error) {
    throw new InternalError("Failed to load the day's plan items.", {
      cause: error,
    });
  }
  const map = new Map<
    MealSlot,
    Pick<PlanCell, "dish_id" | "status" | "locked">
  >();
  for (const cell of (data ?? []) as Pick<
    PlanCell,
    "meal_slot" | "dish_id" | "status" | "locked"
  >[]) {
    map.set(cell.meal_slot, cell);
  }
  return map;
}

/**
 * Attach display packages (design/08 criterion 10, BUG-008/009/010) to a today
 * result's item and alternatives so every card reads as a complete meal — the
 * primary main plus its starch base / condiment. Mutates in place and returns
 * the result for a tidy `return finalizeTodayResult(...)`.
 */
async function finalizeTodayResult(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  result: TodayGenerateResult,
): Promise<TodayGenerateResult> {
  await attachPackages(supabase, [
    ...(result.mealPlanItem ? [result.mealPlanItem] : []),
    ...result.alternatives,
  ]);
  return result;
}

async function loadCell(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  planId: string,
  date: string,
  mealSlot: MealSlot,
): Promise<ActionItemRow | null> {
  const { data, error } = await supabase
    .from("meal_plan_items")
    .select(ITEM_ACTION_SELECT)
    .eq("meal_plan_id", planId)
    .eq("date", date)
    .eq("meal_slot", mealSlot)
    .maybeSingle();
  if (error) {
    throw new InternalError("Failed to load meal plan item.", { cause: error });
  }
  return data as unknown as ActionItemRow | null;
}

async function updateCell(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  itemId: string,
  top: Recommendation,
): Promise<ActionItemRow> {
  const { data, error } = await supabase
    .from("meal_plan_items")
    .update({ dish_id: top.dishId, status: "suggested", reason: top.reason })
    .eq("id", itemId)
    .select(ITEM_ACTION_SELECT)
    .maybeSingle();
  if (error || !data) {
    throw new InternalError("Failed to update suggested meal.", {
      cause: error,
    });
  }
  return data as unknown as ActionItemRow;
}

async function insertCell(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  planId: string,
  householdId: string,
  date: string,
  mealSlot: MealSlot,
  top: Recommendation,
): Promise<ActionItemRow> {
  const { data, error } = await supabase
    .from("meal_plan_items")
    .insert({
      meal_plan_id: planId,
      household_id: householdId,
      date,
      meal_slot: mealSlot,
      dish_id: top.dishId,
      status: "suggested",
      reason: top.reason,
    })
    .select(ITEM_ACTION_SELECT)
    .maybeSingle();
  if (error) {
    // A concurrent generate (e.g. a retried request before its idempotency row
    // was written) inserted this cell first, tripping `unique(meal_plan_id,
    // date, meal_slot)`. Recover by updating the raced row — last-write-wins per
    // the collaboration conflict policy — rather than 500ing the suggestion.
    if (error.code === PG_UNIQUE_VIOLATION) {
      const raced = await loadCell(supabase, planId, date, mealSlot);
      if (raced) return updateCell(supabase, raced.id, top);
    }
    throw new InternalError("Failed to save suggested meal.", { cause: error });
  }
  if (!data) {
    throw new InternalError("Failed to save suggested meal.");
  }
  return data as unknown as ActionItemRow;
}

interface PlanCell {
  date: string;
  meal_slot: MealSlot;
  dish_id: string | null;
  status: ActionItemRow["status"];
  locked: boolean;
}

async function loadPlanCells(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  planId: string,
): Promise<Map<string, PlanCell>> {
  const { data, error } = await supabase
    .from("meal_plan_items")
    .select("date, meal_slot, dish_id, status, locked")
    .eq("meal_plan_id", planId);
  if (error) {
    throw new InternalError("Failed to load existing plan items.", {
      cause: error,
    });
  }
  const map = new Map<string, PlanCell>();
  for (const cell of (data ?? []) as PlanCell[]) {
    map.set(cellKey(cell.date, cell.meal_slot), cell);
  }
  return map;
}

async function countPlanItems(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  planId: string,
): Promise<number> {
  const { count, error } = await supabase
    .from("meal_plan_items")
    .select("id", { count: "exact", head: true })
    .eq("meal_plan_id", planId);
  if (error) {
    throw new InternalError("Failed to count plan items.", { cause: error });
  }
  return count ?? 0;
}

async function loadMealsToPlan(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  householdId: string,
): Promise<MealSlot[]> {
  const { data, error } = await supabase
    .from("household_preferences")
    .select("meals_to_plan")
    .eq("household_id", householdId)
    .maybeSingle();
  if (error) {
    throw new InternalError("Failed to load planned meal slots.", {
      cause: error,
    });
  }
  if (!data) throw NO_PREFERENCES();
  return (data.meals_to_plan ?? []) as MealSlot[];
}

function cellKey(date: string, slot: MealSlot): string {
  return `${date}|${slot}`;
}
