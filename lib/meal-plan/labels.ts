/**
 * Client-safe display labels for the meal-planning UI (P5). Pure data — derives
 * value sets from the generated `Constants`, so a new enum value forces a label
 * here (the maps are exhaustive `Record`s TS errors on if a key is missing).
 */

import type { Database } from "@/lib/db/database.types";
import type { PairedDishDto } from "@/lib/services/meal-plan/dto";

type MealItemStatus = Database["public"]["Enums"]["meal_item_status"];
type FeedbackType = Database["public"]["Enums"]["feedback_type"];

const MEAL_ITEM_STATUS_LABELS: Record<MealItemStatus, string> = {
  suggested: "Suggested",
  accepted: "Accepted",
  rejected: "Rejected",
  replaced: "Replaced",
  cooked: "Cooked",
  skipped: "Skipped",
  eating_out: "Eating out",
};

export function mealItemStatusLabel(value: MealItemStatus): string {
  return MEAL_ITEM_STATUS_LABELS[value];
}

const FEEDBACK_TYPE_LABELS: Record<FeedbackType, string> = {
  liked: "Liked it",
  disliked: "Didn't like it",
  too_much_effort: "Too much effort",
  ingredients_unavailable: "Ingredients unavailable",
  kids_disliked: "Kids didn't like it",
  do_not_suggest_again: "Don't suggest again",
  suggest_more_often: "Suggest more often",
};

export function feedbackTypeLabel(value: FeedbackType): string {
  return FEEDBACK_TYPE_LABELS[value];
}

/**
 * The "+ Steamed Rice + Coconut Chutney" suffix for a package's accompaniments
 * (BUG-008/009/010), or `null` when the dish stands alone. The board renders the
 * primary dish name and appends this so a card reads as one complete meal.
 */
export function packagePairingSuffix(paired: PairedDishDto[]): string | null {
  if (paired.length === 0) return null;
  return paired.map((p) => `+ ${p.dishName}`).join(" ");
}

/** The reasons offered when rejecting a suggestion (design/08 § 2 mapping). */
export const REJECT_FEEDBACK_OPTIONS: readonly {
  value: FeedbackType;
  label: string;
}[] = (
  [
    "too_much_effort",
    "ingredients_unavailable",
    "kids_disliked",
    "disliked",
    "do_not_suggest_again",
  ] satisfies FeedbackType[]
).map((value) => ({ value, label: FEEDBACK_TYPE_LABELS[value] }));
