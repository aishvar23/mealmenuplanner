import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { requireAuthUser } from "@/lib/auth";
import type { Database } from "@/lib/db/database.types";
import {
  actorDisplayName,
  formatSlotLabel,
  safeEmitHouseholdEvent,
} from "@/lib/events";
import { ConflictError, InternalError, ValidationError } from "@/lib/errors";
import { safeRegenerateGroceryListForPlan } from "@/lib/services/grocery";

import {
  ITEM_ACTION_SELECT,
  loadItemForAction,
  type ActionItemRow,
} from "./access";
import {
  toMealPlanItemDto,
  type MealPlanItemDto,
  type RejectResult,
  type ReplaceResult,
  type TodayGenerateResult,
} from "./dto";
import { generateToday } from "./generate";
import { suggestForSlot, toAlternatives } from "./suggest";
import type { FeedbackType } from "./validate";

/**
 * `mealPlan` service — actions on a single `meal_plan_items` cell, addressed by
 * id (design/04 § 4.5, design/08 § 2/§ 4–7). Every action gates on
 * `can_change_today_menu` resolved from the row's household
 * ({@link loadItemForAction}); RLS re-checks the same flag on the write.
 *
 * Grocery regeneration (design/08 § 9/§ 10, P7) and the menu-change /
 * lock / eating-out notifications (design/09, P8) fire from these actions once
 * those services exist; the hook points are marked inline.
 */

/**
 * Accept a suggested meal (design/08 § 2, `suggested → accepted`). Requires the
 * slot to have a dish; an eating-out / empty slot cannot be accepted.
 */
export async function acceptItem(itemId: string): Promise<MealPlanItemDto> {
  const user = await requireAuthUser();
  const { supabase, item } = await loadItemForAction(itemId);
  if (!item.dish_id) {
    throw new ValidationError("There is no dish to accept for this slot.", [
      { field: "dishId", rule: "required" },
    ]);
  }

  const updated = await applyItemUpdate(supabase, itemId, {
    status: "accepted",
    changed_by_user_id: user.id,
  });
  return toMealPlanItemDto(updated);
}

/**
 * "Suggest another" (design/08 § 2, no reason recorded): re-run the recommender
 * excluding the current dish and overwrite the same cell, status stays
 * `suggested`. Delegates to {@link generateToday} (which gates + persists).
 */
export async function suggestAnotherItem(
  itemId: string,
): Promise<TodayGenerateResult> {
  const { item } = await loadItemForAction(itemId);
  return generateToday(item.household_id, item.date, item.meal_slot, {
    excludeDishIds: item.dish_id ? [item.dish_id] : [],
  });
}

/**
 * Reject a suggestion with a reason (design/08 § 2, Flow 4). Records the
 * `meal_feedback` row (which the recommender reads to penalize the dish — a
 * `do_not_suggest_again` becomes a hard exclude) and marks the item `rejected`,
 * **keeping its dish** so the rotation/feedback signals stay correct, then
 * returns ranked alternatives so the client can offer a replacement without a
 * round trip. Filling the slot is the Replace step.
 */
export async function rejectItem(
  itemId: string,
  input: { feedbackType: FeedbackType; reason: string | null },
): Promise<RejectResult> {
  const user = await requireAuthUser();
  const { supabase, item } = await loadItemForAction(itemId);
  if (!item.dish_id) {
    throw new ValidationError("There is no dish to reject for this slot.", [
      { field: "dishId", rule: "required" },
    ]);
  }

  await insertFeedback(
    supabase,
    item,
    user.id,
    input.feedbackType,
    input.reason,
  );

  const updated = await applyItemUpdate(supabase, itemId, {
    status: "rejected",
    changed_by_user_id: user.id,
    reason: input.reason,
  });

  await safeEmitHouseholdEvent(supabase, {
    householdId: item.household_id,
    eventType: "meal_rejected",
    entityType: "meal_plan_item",
    entityId: item.id,
    vars: {
      actorName: actorDisplayName(user),
      dish: item.dishes?.name ?? null,
      slotLabel: formatSlotLabel(item.meal_slot, item.date),
    },
  });

  const { recommendations, nameById } = await suggestForSlot(
    item.household_id,
    item.date,
    item.meal_slot,
    { excludeDishIds: [item.dish_id] },
  );

  return {
    mealPlanItem: toMealPlanItemDto(updated),
    alternatives: toAlternatives(recommendations, nameById),
  };
}

/**
 * Replace a meal (design/08 § 5, Flow 4). Validates the chosen replacement is an
 * eligible dish for the slot (or picks one when omitted), records a
 * `meal_feedback` row if a rejection reason came in, swaps the dish, and sets the
 * cell `accepted`. A confirmed-meal change (old status `accepted`/`cooked`)
 * triggers the meal-changed notification (P8); the swap always invalidates the
 * grocery list (P7).
 */
export async function replaceItem(
  itemId: string,
  input: {
    replacementDishId: string | null;
    reason: string | null;
    feedbackType: FeedbackType | null;
  },
): Promise<ReplaceResult> {
  const user = await requireAuthUser();
  const { supabase, item } = await loadItemForAction(itemId);
  if (item.locked) {
    throw new ConflictError(
      "This meal is locked. Unlock it before replacing.",
      {
        reason: "locked",
      },
    );
  }

  // Rank the slot once; use it to validate a chosen dish or pick a fresh one.
  const { recommendations, nameById } = await suggestForSlot(
    item.household_id,
    item.date,
    item.meal_slot,
    { excludeDishIds: item.dish_id ? [item.dish_id] : [] },
  );
  const eligibleIds = new Set(recommendations.map((r) => r.dishId));

  let replacementDishId: string;
  let reason = input.reason;
  if (input.replacementDishId) {
    if (!eligibleIds.has(input.replacementDishId)) {
      throw new ValidationError(
        "That dish isn't an eligible choice for this slot.",
        [{ field: "replacementDishId", rule: "ineligible" }],
      );
    }
    replacementDishId = input.replacementDishId;
    reason =
      reason ??
      recommendations.find((r) => r.dishId === replacementDishId)?.reason ??
      null;
  } else {
    const top = recommendations[0];
    if (!top) {
      throw new ValidationError("No eligible replacement dish for this slot.", [
        { field: "replacementDishId", rule: "no_candidate" },
      ]);
    }
    replacementDishId = top.dishId;
    reason = reason ?? top.reason;
  }

  if (input.feedbackType) {
    await insertFeedback(
      supabase,
      item,
      user.id,
      input.feedbackType,
      input.reason,
    );
  }

  const updated = await applyItemUpdate(supabase, itemId, {
    dish_id: replacementDishId,
    status: "accepted",
    reason,
    changed_by_user_id: user.id,
  });

  // The planned dish changed → refresh the derived grocery list (design/08 § 10,
  // P7-3). Best-effort so a grocery glitch doesn't fail the swap.
  await safeRegenerateGroceryListForPlan(
    supabase,
    item.household_id,
    item.meal_plan_id,
  );

  // The planned dish changed → tell the household (design/09 § 2 `meal_changed`).
  await safeEmitHouseholdEvent(supabase, {
    householdId: item.household_id,
    eventType: "meal_changed",
    entityType: "meal_plan_item",
    entityId: item.id,
    oldValue: { dishId: item.dish_id },
    newValue: { dishId: replacementDishId },
    vars: {
      actorName: actorDisplayName(user),
      slot: item.meal_slot,
      slotLabel: formatSlotLabel(item.meal_slot, item.date),
      fromDish: item.dishes?.name ?? null,
      toDish: nameById.get(replacementDishId) ?? null,
    },
  });

  return { mealPlanItem: toMealPlanItemDto(updated), groceryListUpdated: true };
}

/**
 * Mark a slot as eating out (design/08 § 6, Flow 5): clears the dish and sets
 * `eating_out`, which is deliberately NOT counted in rotation (the dish keeps no
 * cooked footprint) and drops its ingredients from the grocery list (P7).
 */
export async function markEatingOut(itemId: string): Promise<MealPlanItemDto> {
  const user = await requireAuthUser();
  const { supabase, item } = await loadItemForAction(itemId);
  if (item.locked) {
    throw new ConflictError("This meal is locked. Unlock it first.", {
      reason: "locked",
    });
  }

  const updated = await applyItemUpdate(supabase, itemId, {
    status: "eating_out",
    dish_id: null,
    changed_by_user_id: user.id,
  });

  // The dish's ingredients must drop off the grocery list (Flow 5 step 7,
  // design/08 § 6/§ 10, P7-3). Best-effort.
  await safeRegenerateGroceryListForPlan(
    supabase,
    item.household_id,
    item.meal_plan_id,
  );

  await safeEmitHouseholdEvent(supabase, {
    householdId: item.household_id,
    eventType: "meal_marked_eating_out",
    entityType: "meal_plan_item",
    entityId: item.id,
    oldValue: { status: item.status, dishId: item.dish_id },
    newValue: { status: "eating_out" },
    vars: {
      actorName: actorDisplayName(user),
      slotLabel: formatSlotLabel(item.meal_slot, item.date),
    },
  });

  return toMealPlanItemDto(updated);
}

/** Lock a cell so regeneration never overwrites it (design/08 § 7). */
export async function lockItem(itemId: string): Promise<MealPlanItemDto> {
  return setLocked(itemId, true);
}

/** Unlock a cell, making it eligible for the next regeneration (design/08 § 7). */
export async function unlockItem(itemId: string): Promise<MealPlanItemDto> {
  return setLocked(itemId, false);
}

/**
 * Mark a planned meal as cooked (design/08 § 4, P5-7). `cooked` is a terminal
 * outcome that feeds the variety/rotation history. Requires a dish (an
 * eating-out / empty slot was never cooked).
 */
export async function markCookedItem(itemId: string): Promise<MealPlanItemDto> {
  const user = await requireAuthUser();
  const { supabase, item } = await loadItemForAction(itemId);
  if (!item.dish_id || item.status === "eating_out") {
    throw new ValidationError("This slot has no dish to mark cooked.", [
      { field: "dishId", rule: "required" },
    ]);
  }

  const updated = await applyItemUpdate(supabase, itemId, {
    status: "cooked",
    changed_by_user_id: user.id,
  });
  return toMealPlanItemDto(updated);
}

// ──────────────────────────────── helpers ────────────────────────────────

type ServerClient = SupabaseClient<Database>;
type ItemUpdate = Database["public"]["Tables"]["meal_plan_items"]["Update"];

async function setLocked(
  itemId: string,
  locked: boolean,
): Promise<MealPlanItemDto> {
  const user = await requireAuthUser();
  const { supabase, item } = await loadItemForAction(itemId);
  const updated = await applyItemUpdate(supabase, itemId, { locked });

  await safeEmitHouseholdEvent(supabase, {
    householdId: item.household_id,
    eventType: locked ? "meal_locked" : "meal_unlocked",
    entityType: "meal_plan_item",
    entityId: item.id,
    newValue: { locked },
    vars: {
      actorName: actorDisplayName(user),
      slot: item.meal_slot,
      slotLabel: formatSlotLabel(item.meal_slot, item.date),
    },
  });

  return toMealPlanItemDto(updated);
}

/** Apply a partial update to an item and return the refreshed row (with dish name). */
async function applyItemUpdate(
  supabase: ServerClient,
  itemId: string,
  update: ItemUpdate,
): Promise<ActionItemRow> {
  const { data, error } = await supabase
    .from("meal_plan_items")
    .update(update)
    .eq("id", itemId)
    .select(ITEM_ACTION_SELECT)
    .maybeSingle();
  if (error || !data) {
    throw new InternalError("Failed to update meal plan item.", {
      cause: error,
    });
  }
  return data as unknown as ActionItemRow;
}

/** Record one `meal_feedback` row for the rejected/replaced dish (design/08 § 2). */
async function insertFeedback(
  supabase: ServerClient,
  item: ActionItemRow,
  userId: string,
  feedbackType: FeedbackType,
  reason: string | null,
): Promise<void> {
  const { error } = await supabase.from("meal_feedback").insert({
    household_id: item.household_id,
    meal_plan_item_id: item.id,
    user_id: userId,
    feedback_type: feedbackType,
    reason,
  });
  if (error) {
    throw new InternalError("Failed to record meal feedback.", {
      cause: error,
    });
  }
}
