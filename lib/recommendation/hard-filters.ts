/**
 * Hard filters (design/05 § 4) — a candidate matching **any** rule is excluded
 * before scoring and can never appear in the output. Every rule from doc 04 is
 * reproduced as a pure predicate; `hardFilterExclusion` returns the first reason
 * a dish is dropped (or `null` if it survives) so exclusions are debuggable and
 * table-testable.
 *
 * The slot, diet, allergy, do-not-suggest-again, and prep-impossible rules are
 * here. Temporary-guest restrictions (§4) need no separate rule: an active
 * guest's `user_food_preferences` are loaded into `members`, so their diet and
 * allergies already fold into the diet/allergy rules for the duration of the stay.
 */

import { containsAllergen } from "./allergens";
import type { RecommendationConfig } from "./config";
import { isDietCompatible } from "./diet";
import { prepFeasibility } from "./prep";
import type { CandidateDish, DietType, MealHistory, MealSlot } from "./types";

/** Why a candidate was hard-filtered out (design/05 § 4). */
export type HardFilterReason =
  | "slot"
  | "doNotSuggestAgain"
  | "diet"
  | "allergen"
  | "prepImpossible";

/** Inputs the hard filters share, resolved once per generate call. */
export interface HardFilterContext {
  effectiveDiet: DietType;
  /** Normalized union of active members' allergies. */
  allergyTerms: readonly string[];
  mealSlot: MealSlot;
  date: string;
  now: Date;
  history: MealHistory;
  config: RecommendationConfig;
}

/**
 * The first hard-filter rule `dish` violates, or `null` if it passes all of
 * them. Cheap checks (slot, feedback set membership) run before the
 * ingredient-scanning ones (diet, allergen) and the clock-dependent prep check.
 */
export function hardFilterExclusion(
  dish: CandidateDish,
  ctx: HardFilterContext,
): HardFilterReason | null {
  if (!dish.mealSlots.includes(ctx.mealSlot)) return "slot";
  if (ctx.history.doNotSuggestAgainDishIds.has(dish.id)) {
    return "doNotSuggestAgain";
  }
  if (!isDietCompatible(dish, ctx.effectiveDiet, ctx.config)) return "diet";
  if (containsAllergen(dish, ctx.allergyTerms)) return "allergen";
  if (
    prepFeasibility(dish, ctx.date, ctx.mealSlot, ctx.now, ctx.config)
      .outcome === "impossible"
  ) {
    return "prepImpossible";
  }
  return null;
}
