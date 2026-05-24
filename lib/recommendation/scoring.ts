/**
 * Soft scoring (design/05 § 5) — surviving candidates accumulate the exact
 * weighted factors from doc 04. Each factor records its label so the explanation
 * generator (§8) can reuse the positive ones and the output contract (§9) can
 * surface the negative ones. Pure: every input is passed in, no I/O, no clock
 * beyond the prep outcome the engine resolved once.
 *
 * Variety (§6.1) lives here too: a dish is "recently cooked" if it has any
 * history row within `variety_gap_days` OR was already chosen earlier in a weekly
 * run (`usedThisRun`). That flips the +40 "not repeated" into the −60 "recently
 * cooked", a −100 swing (§6.1).
 *
 * Member preferences (disliked ingredients/dishes, liked dishes) are folded into
 * the existing factors per the § 5 note — they are *not* new weights: a liked
 * dish enables the +10 preferred-ingredient bonus (suppressed if the dish carries
 * a disliked ingredient), and a disliked dish joins the recently-rejected −80
 * signal. The schema has no liked-ingredient field, so "preferred" keys off a
 * matching `liked_dishes` name (design/05 § 5 sanctioned interpretation).
 */

import type { RecommendationConfig } from "./config";
import { ingredientMatchesAnyTerm, normalizeTerm } from "./text-match";
import type { PrepOutcome } from "./prep";
import type {
  CandidateDish,
  HouseholdContext,
  MealHistory,
  MealSlot,
  MemberContext,
  ScoredFactor,
} from "./types";

/** Member preferences pre-aggregated across all active members (design/05 § 3.2). */
export interface MemberAggregate {
  /** Normalized dish names any member likes → enables the +10 bonus. */
  likedDishNames: ReadonlySet<string>;
  /** Normalized dish names any member dislikes → joins the −80 signal. */
  dislikedDishNames: ReadonlySet<string>;
  /** Union of disliked-ingredient terms → suppresses the +10 bonus. */
  dislikedIngredients: readonly string[];
}

/** Build the {@link MemberAggregate} once per generate call. */
export function aggregateMemberPreferences(
  members: readonly MemberContext[],
): MemberAggregate {
  const likedDishNames = new Set<string>();
  const dislikedDishNames = new Set<string>();
  const dislikedIngredients = new Set<string>();
  for (const member of members) {
    for (const name of member.likedDishes) {
      const n = normalizeTerm(name);
      if (n) likedDishNames.add(n);
    }
    for (const name of member.dislikedDishes) {
      const n = normalizeTerm(name);
      if (n) dislikedDishNames.add(n);
    }
    for (const ing of member.dislikedIngredients) {
      const n = normalizeTerm(ing);
      if (n) dislikedIngredients.add(n);
    }
  }
  return {
    likedDishNames,
    dislikedDishNames,
    dislikedIngredients: [...dislikedIngredients],
  };
}

/**
 * The applicable cooking-time limit (design/05 § 3.1): weekend uses the weekend
 * limit, falling back to the weekday limit if the weekend one is unset. `null`
 * means no limit is configured, so the cooking-time factor is skipped.
 */
export function resolveCookingTimeLimit(
  household: HouseholdContext,
  weekend: boolean,
): number | null {
  if (weekend) {
    return (
      household.weekendCookingTimeMinutes ?? household.weekdayCookingTimeMinutes
    );
  }
  return household.weekdayCookingTimeMinutes;
}

/** True when `dish` counts as recently cooked for variety (design/05 § 6.1). */
export function isRecentlyCooked(
  dishId: string,
  history: MealHistory,
  usedThisRun: ReadonlySet<string>,
): boolean {
  return history.recentlyCookedDishIds.has(dishId) || usedThisRun.has(dishId);
}

/** Everything `scoreDish` needs, resolved once per generate call. */
export interface ScoringContext {
  household: HouseholdContext;
  memberAggregate: MemberAggregate;
  history: MealHistory;
  usedThisRun: ReadonlySet<string>;
  mealSlot: MealSlot;
  weekend: boolean;
  cookingTimeLimit: number | null;
  /** Prep outcome resolved by the engine (`none` | `deferrable`; never `impossible`). */
  prepOutcome: PrepOutcome;
  /** V2 only — set of primary ingredient ids cooked recently (§6.2). */
  recentPrimaryIngredientIds: ReadonlySet<string>;
  config: RecommendationConfig;
}

/** A dish's primary ingredient (highest-quantity required), for V2 repetition (§6.2). */
export function primaryIngredientId(dish: CandidateDish): string | null {
  let best: CandidateDish["ingredients"][number] | null = null;
  for (const ing of dish.ingredients) {
    if (!ing.isRequired) continue;
    if (best === null || ing.quantityPerServing > best.quantityPerServing) {
      best = ing;
    }
  }
  return best?.ingredientId ?? null;
}

/**
 * Score a (surviving) candidate dish: the labelled factors that fired, in
 * declaration order. `finalScore = Σ factor.weight`. The engine calls this only
 * on dishes that passed the hard filters, so diet/slot always hold.
 */
export function scoreDish(
  dish: CandidateDish,
  ctx: ScoringContext,
): ScoredFactor[] {
  const w = ctx.config.weights;
  const factors: ScoredFactor[] = [];

  // Diet match (+100) — survivors always satisfy this; anchors diet-correct
  // dishes at the top (design/05 § 5).
  factors.push({ label: "dietMatch", weight: w.dietMatch });

  // Meal slot match (+50) — survivors always match the requested slot.
  if (dish.mealSlots.includes(ctx.mealSlot)) {
    factors.push({ label: "mealSlotMatch", weight: w.mealSlotMatch });
  }

  // Cuisine preference (+30).
  if (matchesPreferredCuisine(dish, ctx.household.preferredCuisines)) {
    factors.push({ label: "cuisineMatch", weight: w.cuisineMatch });
  }

  // Cooking time within / exceeds limit (+30 / −40).
  if (ctx.cookingTimeLimit !== null && dish.totalTimeMinutes !== null) {
    if (dish.totalTimeMinutes <= ctx.cookingTimeLimit) {
      factors.push({
        label: "cookingTimeWithinLimit",
        weight: w.cookingTimeWithinLimit,
      });
    } else {
      factors.push({
        label: "exceedsCookingTime",
        weight: w.exceedsCookingTime,
      });
    }
  }

  // Variety / rotation (+40 not-repeated / −60 recently-cooked) (design/05 § 6.1).
  if (isRecentlyCooked(dish.id, ctx.history, ctx.usedThisRun)) {
    factors.push({
      label: "recentlyCookedWithinGap",
      weight: w.recentlyCookedWithinGap,
    });
  } else {
    factors.push({
      label: "notRepeatedRecently",
      weight: w.notRepeatedRecently,
    });
  }

  // Kid-friendly when kids exist (+20).
  if (dish.kidFriendly && ctx.household.kidsCount > 0) {
    factors.push({
      label: "kidFriendlyWhenKids",
      weight: w.kidFriendlyWhenKids,
    });
  }

  // Lunchbox-friendly for lunch (+15).
  if (dish.lunchboxFriendly && ctx.mealSlot === "lunch") {
    factors.push({
      label: "lunchboxFriendlyForLunch",
      weight: w.lunchboxFriendlyForLunch,
    });
  }

  // Preferred ingredient (+10) — liked-dish match, suppressed by a disliked
  // ingredient present in the dish (design/05 § 5 note).
  if (
    ctx.memberAggregate.likedDishNames.has(normalizeTerm(dish.name)) &&
    !dishHasDislikedIngredient(dish, ctx.memberAggregate.dislikedIngredients)
  ) {
    factors.push({
      label: "preferredIngredient",
      weight: w.preferredIngredient,
    });
  }

  // Recently rejected (−80) — history rejection OR a disliked-dish name match.
  if (
    ctx.history.recentlyRejectedDishIds.has(dish.id) ||
    ctx.memberAggregate.dislikedDishNames.has(normalizeTerm(dish.name))
  ) {
    factors.push({ label: "recentlyRejected", weight: w.recentlyRejected });
  }

  // Missing required prep (−60) — deferrable prep that is not yet done (§7).
  if (ctx.prepOutcome === "deferrable") {
    factors.push({
      label: "missingRequiredPrep",
      weight: w.missingRequiredPrep,
    });
  }

  // High difficulty on a weekday (−30).
  if (dish.difficulty === "hard" && !ctx.weekend) {
    factors.push({
      label: "highDifficultyOnWeekday",
      weight: w.highDifficultyOnWeekday,
    });
  }

  // Primary-ingredient repetition (V2, off by default — design/05 § 6.2).
  if (ctx.config.ingredientRepetition.enabled) {
    const primary = primaryIngredientId(dish);
    if (primary !== null && ctx.recentPrimaryIngredientIds.has(primary)) {
      factors.push({
        label: "ingredientRepetition",
        weight: ctx.config.ingredientRepetition.penalty,
      });
    }
  }

  return factors;
}

function matchesPreferredCuisine(
  dish: CandidateDish,
  preferred: readonly string[],
): boolean {
  if (dish.cuisine === null) return false;
  const cuisine = normalizeTerm(dish.cuisine);
  return preferred.some((p) => normalizeTerm(p) === cuisine);
}

function dishHasDislikedIngredient(
  dish: CandidateDish,
  dislikedIngredients: readonly string[],
): boolean {
  if (dislikedIngredients.length === 0) return false;
  return dish.ingredients.some((ing) =>
    ingredientMatchesAnyTerm(ing, dislikedIngredients),
  );
}
