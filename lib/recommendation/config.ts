/**
 * Recommendation tuning — the single place weights, thresholds, mealtimes, and
 * feature flags live (design/05 § 11). Scoring functions read from this object,
 * so changing behavior is a config edit, not a logic change.
 *
 * The `weights` block is reproduced **verbatim** from
 * [`../../docs/04_recommendation_engine.md`](../../docs/04_recommendation_engine.md)
 * and design/05 § 5; any numeric divergence is a bug — doc 04 is the authority.
 *
 * Pure data (no I/O), so the engine stays deterministic and unit-testable.
 */

import type { MealSlot } from "./types";

/** The shape of the tuning object so tests can build variants (design/05 § 11). */
export interface RecommendationConfig {
  weights: {
    dietMatch: number;
    mealSlotMatch: number;
    cuisineMatch: number;
    cookingTimeWithinLimit: number;
    notRepeatedRecently: number;
    kidFriendlyWhenKids: number;
    lunchboxFriendlyForLunch: number;
    preferredIngredient: number;
    recentlyRejected: number;
    recentlyCookedWithinGap: number;
    missingRequiredPrep: number;
    exceedsCookingTime: number;
    highDifficultyOnWeekday: number;
    /**
     * P10 extension (gated by {@link combinations}; not part of the doc-04 set).
     * A dish that is popular (own popularity ≥ {@link popularity} threshold, or a
     * member of a popular combination) gets `popularDish`. A `daily`-tier dish
     * gets `frequencyDaily`; an `once_in_a_while`-tier dish gets the negative
     * `frequencyOnceInAWhile`; `once_a_week` is the neutral baseline (no factor).
     */
    popularDish: number;
    frequencyDaily: number;
    frequencyOnceInAWhile: number;
    /**
     * BUG-015 fix (gated by {@link combinations}). Any dish this household chose
     * during onboarding (a `build`-mode dish or a member dish of a selected
     * combination → `household_dish_preferences`) earns this positive factor,
     * **regardless of its frequency tier**. It is sized to clear the generic
     * factors and to outweigh the `frequencyOnceInAWhile` penalty, so the
     * household's own picks rank above unchosen catalog dishes (the chosen-combo
     * bug) while the frequency tiers still order the chosen set among themselves.
     * Distinct from the global `popularDish` signal, which is gated on global
     * popularity; this fires on the household's own picks alone.
     */
    householdChosenDish: number;
  };
  /** How many ranked suggestions the per-slot recommender returns. */
  topN: number;
  /**
   * Default mealtime per slot as `HH:MM`, interpreted in **UTC** (design/05 § 7).
   * The MVP does not store a household timezone (that is a P7 prep-reminder
   * concern), so prep feasibility computes `minutesUntilMeal` in UTC — a
   * documented simplification, accurate for future-dated planning and close
   * enough for today's slot.
   */
  mealtimes: Record<MealSlot, string>;
  /** Diet hard-filter refinement sets (design/05 § 4); see `./diet.ts`. */
  diet: {
    /** `ingredients.category` values that make a dish non-vegan. */
    nonVeganCategories: string[];
    /** Ingredient name / common-name / allergen-type terms that are non-vegan. */
    nonVeganTerms: string[];
    /** Ingredient terms a jain household excludes (onion/garlic family). */
    jainExcludedTerms: string[];
  };
  /**
   * Primary-ingredient repetition reduction (design/05 § 6.2) — **V2, off by
   * default** so the MVP scoring contract matches doc 04 exactly. When enabled,
   * a dish whose primary ingredient repeats within `windowDays` takes `penalty`.
   */
  ingredientRepetition: {
    enabled: boolean;
    penalty: number;
    windowDays: number;
  };
  /**
   * P10 meal-combinations / frequency extension. When `combinations.enabled` is
   * false the scoring contract reduces to doc 04 exactly (no popular/frequency
   * factors, and a `daily` tier no longer waives the variety penalty) — kept so
   * the baseline stays reproducible in tests. `popularity.threshold` is the
   * minimum dish `popularity_count` that earns the `popularDish` bonus.
   */
  combinations: {
    enabled: boolean;
    popularityThreshold: number;
  };
}

export const RECOMMENDATION_CONFIG: RecommendationConfig = {
  weights: {
    dietMatch: 100,
    mealSlotMatch: 50,
    cuisineMatch: 30,
    cookingTimeWithinLimit: 30,
    notRepeatedRecently: 40,
    kidFriendlyWhenKids: 20,
    lunchboxFriendlyForLunch: 15,
    preferredIngredient: 10,
    recentlyRejected: -80,
    recentlyCookedWithinGap: -60,
    missingRequiredPrep: -60,
    exceedsCookingTime: -40,
    highDifficultyOnWeekday: -30,
    // P10 extension (below mealSlotMatch 50, above cuisineMatch 30 for daily).
    popularDish: 15,
    frequencyDaily: 35,
    frequencyOnceInAWhile: -20,
    // BUG-015: clears cuisine (30) / cooking-time (30) / variety (40) swings and
    // overcomes the −20 once-in-a-while penalty, so chosen dishes rank first.
    householdChosenDish: 60,
  },
  topN: 5,
  mealtimes: {
    breakfast: "08:00",
    lunch: "12:30",
    dinner: "19:00",
    snack: "16:00",
  },
  diet: {
    nonVeganCategories: ["dairy", "eggs_meat"],
    nonVeganTerms: [
      "milk",
      "dairy",
      "paneer",
      "cheese",
      "butter",
      "ghee",
      "cream",
      "curd",
      "yogurt",
      "yoghurt",
      "khoya",
      "mawa",
      "egg",
      "eggs",
      "honey",
    ],
    jainExcludedTerms: ["onion", "garlic", "shallot", "leek", "spring onion"],
  },
  ingredientRepetition: { enabled: false, penalty: -25, windowDays: 2 },
  combinations: { enabled: true, popularityThreshold: 5 },
} as const;
