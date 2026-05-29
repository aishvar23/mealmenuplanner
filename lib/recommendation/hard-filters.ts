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
import {
  STANDALONE_MEAL_ROLES,
  type CandidateDish,
  type DietType,
  type MealHistory,
  type MealSlot,
} from "./types";

/** Why a candidate was hard-filtered out (design/05 § 4). */
export type HardFilterReason =
  | "slot"
  | "householdSlot"
  | "notHouseholdChosen"
  | "notStandalone"
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
  /**
   * Per-dish household slot restrictions (P10-8), dishId → allowed slots. A dish
   * present here is excluded from any slot not in its list; an absent dish is
   * unrestricted. From `HouseholdContext.dishSuitableSlots`.
   */
  dishSuitableSlots: ReadonlyMap<string, MealSlot[]>;
  /**
   * When true, only dishes the household explicitly chose ({@link chosenDishIds})
   * are eligible — every other catalog dish is hard-excluded (BUG-027). The engine
   * sets this when the household built its own dish list (and the combinations
   * feature is on); a household that chose nothing keeps the full catalog.
   */
  restrictToChosen: boolean;
  /** Dish ids the household chose (`HouseholdContext.chosenDishIds`); see {@link restrictToChosen}. */
  chosenDishIds: ReadonlySet<string>;
  /**
   * When true, a dish whose advance prep can't be finished in time is NOT excluded
   * (BUG-031) — it survives the filter so the manual picker can offer it with a
   * prep caveat. From `SlotRecommendationInput.allowInfeasiblePrep`.
   */
  allowInfeasiblePrep: boolean;
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
  // Household per-dish "suitable for" restriction (P10-8, build mode): a dish the
  // household limited to specific slots is excluded from any other slot. An empty
  // / absent list means no restriction beyond the global meal_slots check above.
  const householdSlots = ctx.dishSuitableSlots.get(dish.id);
  if (
    householdSlots &&
    householdSlots.length > 0 &&
    !householdSlots.includes(ctx.mealSlot)
  ) {
    return "householdSlot";
  }
  // The household built its own dish list, so only its chosen dishes are offered
  // (BUG-027) — "try another" and every suggestion must stay within the picks the
  // household made, filtered by slot, instead of leaking the whole catalog. This
  // is a *hard* restriction, distinct from the soft `householdChosenDish` bonus
  // (§5) that only re-ranks. Gated by the engine (`restrictToChosen`) so a
  // household that chose nothing still sees the full catalog.
  if (ctx.restrictToChosen && !ctx.chosenDishIds.has(dish.id)) {
    return "notHouseholdChosen";
  }
  // A side / condiment / lone component is never a standalone meal — it can only
  // appear as a pairing of a main (design/05 § 4, BUG-008/009/010).
  if (!STANDALONE_MEAL_ROLES.includes(dish.mealRole)) return "notStandalone";
  if (ctx.history.doNotSuggestAgainDishIds.has(dish.id)) {
    return "doNotSuggestAgain";
  }
  if (!isDietCompatible(dish, ctx.effectiveDiet, ctx.config)) return "diet";
  if (containsAllergen(dish, ctx.allergyTerms)) return "allergen";
  // Prep that can no longer be finished in time excludes a dish from
  // auto-suggestions, but the manual picker (`allowInfeasiblePrep`) keeps it and
  // surfaces a prep caveat instead of silently dropping the user's chosen dish.
  if (
    !ctx.allowInfeasiblePrep &&
    prepFeasibility(dish, ctx.date, ctx.mealSlot, ctx.now, ctx.config)
      .outcome === "impossible"
  ) {
    return "prepImpossible";
  }
  return null;
}
