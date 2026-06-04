/**
 * Recommendation engine domain types — the camelCase input/output model the pure
 * scoring pipeline (`./engine.ts`) operates on (design/05 § 3, § 9).
 *
 * These are deliberately decoupled from the snake_case DB row shapes: the
 * server-only loaders (`lib/services/recommendation`) translate rows → these
 * types once per generate call, so the engine itself is pure, runtime-agnostic,
 * and trivially unit-testable with plain fixtures (design/05 § 11). No
 * `server-only`, no Supabase, no React imports here.
 *
 * Enum **values** pass through unchanged — they are data, not naming convention
 * (design/00 convention reminder).
 */

import type { Database } from "@/lib/db/database.types";
import type { DishNutrition } from "@/lib/meal-plan/nutrition";

export type DietType = Database["public"]["Enums"]["diet_type"];
export type DifficultyLevel = Database["public"]["Enums"]["difficulty_level"];
export type MealSlot = Database["public"]["Enums"]["meal_slot"];
export type MealRole = Database["public"]["Enums"]["meal_role"];
export type PairingType = Database["public"]["Enums"]["pairing_type"];
export type ImageStatus = Database["public"]["Enums"]["image_status"];
export type MealFrequency = Database["public"]["Enums"]["meal_frequency"];

/**
 * Meal roles that may be a **standalone** primary recommendation. A dish in any
 * other role (rice/bread component, side, condiment, beverage) is a piece of a
 * meal, never the meal itself, so it's hard-filtered from the primary slot and
 * only ever surfaces as a pairing (BUG-008/009/010, global criteria 9 & 10).
 */
export const STANDALONE_MEAL_ROLES: readonly MealRole[] = [
  "complete_meal",
  "main_component",
];

// ───────────────────────────── loaded inputs (§3) ─────────────────────────────

/**
 * Household-level inputs from `household_preferences` (design/05 § 3.1). One row
 * per household; the applicable cooking-time limit is chosen by weekday/weekend.
 */
export interface HouseholdContext {
  /**
   * The diet(s) the household eats (BETA — multi-diet households). Non-empty; a
   * household that eats both vegetarian and non-vegetarian lists both, and the
   * hard filter unions the acceptable dishes across them
   * (see {@link isDietCompatibleWithHousehold}).
   */
  dietTypes: DietType[];
  preferredCuisines: string[];
  weekdayCookingTimeMinutes: number | null;
  weekendCookingTimeMinutes: number | null;
  varietyGapDays: number;
  kidsCount: number;
  /**
   * Per-dish frequency tiers the household chose in `build` mode (P10), dishId →
   * tier. `daily` opts a staple out of the variety-gap penalty (it's meant to
   * recur); `once_in_a_while` is gently down-weighted. Empty when unused.
   */
  dishFrequencies: ReadonlyMap<string, MealFrequency>;
  /**
   * Dish ids the household explicitly chose during onboarding (BUG-015) — the keys
   * of `household_dish_preferences`: every `build`-mode dish plus every member
   * dish of a selected combination. Earns the positive `householdChosenDish`
   * factor regardless of frequency tier, so the household's own picks rank above
   * unchosen catalog dishes. **Distinct from the global popularity signal**
   * (`popularCombinationDishIds` / `popularityCount`): this is "*this* household
   * picked it", not "popular across all households". Empty when unused.
   */
  chosenDishIds: ReadonlySet<string>;
  /**
   * Per-dish meal-slot restrictions the household set in `build` mode (P10-8),
   * dishId → the slots the dish may be suggested in. A dish present here is
   * hard-filtered out of any slot NOT in its list (§4). Only dishes the household
   * actually restricted appear; an absent dish has no restriction beyond its
   * global `dishes.meal_slots`. Empty map when unused.
   */
  dishSuitableSlots: ReadonlyMap<string, MealSlot[]>;
}

/**
 * One active member's food preferences (design/05 § 3.2). Allergies are unioned
 * across all active members into the hard-exclusion set; dislikes inform
 * scoring; a stricter member `dietType` tightens the effective household diet.
 */
export interface MemberContext {
  /** Member diet override; null = follows the household diet. */
  dietType: DietType | null;
  allergies: string[];
  dislikedIngredients: string[];
  likedDishes: string[];
  dislikedDishes: string[];
}

/** A dish↔ingredient link with the ingredient attributes scoring/filters need. */
export interface CandidateIngredient {
  ingredientId: string;
  name: string;
  /** `ingredients.category` (vegetables, dairy, eggs_meat, …) — used by the vegan filter. */
  category: string;
  commonNames: string[];
  allergenType: string | null;
  imageUrl: string | null;
  imageAltText: string | null;
  imageStatus: ImageStatus;
  quantityPerServing: number;
  isRequired: boolean;
  isOptional: boolean;
}

/** An advance-prep task (`dish_prep_tasks`) feeding prep-feasibility (§7). */
export interface CandidatePrepTask {
  taskName: string;
  requiredBeforeMinutes: number;
  description: string | null;
}

/** A directional pairing (`dish_pairings.primary_dish_id = dish`). */
export interface CandidatePairing {
  dishId: string;
  pairingType: PairingType;
}

/** An active candidate dish with its sub-resources preloaded (design/05 § 3.3). */
export interface CandidateDish {
  id: string;
  name: string;
  dietType: DietType;
  cuisine: string | null;
  mealSlots: string[];
  /** Role in a meal; only standalone roles can be a primary pick (§4 hard filter). */
  mealRole: MealRole;
  /** Stored-generated `prep + cook` (design/01); null only if unset. */
  totalTimeMinutes: number | null;
  /** How often households have picked this dish (P10) — drives the popular bonus. */
  popularityCount: number;
  difficulty: DifficultyLevel;
  kidFriendly: boolean;
  lunchboxFriendly: boolean;
  /**
   * Dietician-curated goal flags (P12), display-only — the engine never scores
   * on them; the suggest/picker DTOs surface them for the top-level meal filter.
   */
  weightLoss: boolean;
  highProtein: boolean;
  imageUrl: string | null;
  imageAltText: string | null;
  imageStatus: ImageStatus;
  /**
   * Per-serving nutrition estimate (P11), display-only — the engine never scores
   * on it; the suggest/read DTOs surface it. `null` for a dish with no data.
   */
  nutrition: DishNutrition | null;
  ingredients: CandidateIngredient[];
  prepTasks: CandidatePrepTask[];
  pairings: CandidatePairing[];
}

/**
 * Historical signals for the household over the lookback window (design/05 § 3.4,
 * § 6). The loader pre-aggregates `meal_plan_items` + `meal_feedback` into sets:
 *
 *  - `recentlyCookedDishIds` — any item in `[date - varietyGapDays, date)` (§6.1).
 *  - `recentlyRejectedDishIds` — items `rejected`/`replaced` recently, plus the
 *    soft `disliked`/`kids_disliked` feedback folded in (design/05 § 5 note).
 *  - `doNotSuggestAgainDishIds` — the hard `do_not_suggest_again` feedback (§4).
 *  - `recentPrimaryIngredientIds` — V2 only (§6.2); empty in the MVP loader.
 */
export interface MealHistory {
  recentlyCookedDishIds: ReadonlySet<string>;
  recentlyRejectedDishIds: ReadonlySet<string>;
  doNotSuggestAgainDishIds: ReadonlySet<string>;
  recentPrimaryIngredientIds?: ReadonlySet<string>;
}

// ───────────────────────────── scored factors (§5) ─────────────────────────────

/** The labelled scoring factors (design/05 § 5). Stable keys for explanations. */
export const FACTOR_LABELS = [
  "dietMatch",
  "mealSlotMatch",
  "cuisineMatch",
  "cookingTimeWithinLimit",
  "notRepeatedRecently",
  "kidFriendlyWhenKids",
  "lunchboxFriendlyForLunch",
  "preferredIngredient",
  "recentlyRejected",
  "recentlyCookedWithinGap",
  "missingRequiredPrep",
  "exceedsCookingTime",
  "highDifficultyOnWeekday",
  "ingredientRepetition",
  // P10 — combination popularity + per-dish frequency (gated by config.combinations).
  "popularDish",
  "frequencyDaily",
  "frequencyOnceInAWhile",
  // BUG-015 — "this household chose this dish" positive factor.
  "householdChosenDish",
] as const;

export type FactorLabel = (typeof FACTOR_LABELS)[number];

/** One labelled factor that fired during scoring (design/05 § 5). */
export interface ScoredFactor {
  label: FactorLabel;
  weight: number;
}

// ───────────────────────────── output contract (§9) ─────────────────────────────

/** A soft negative that fired — surfaced as a caveat, not narrated in `reason`. */
export interface MissingConstraint {
  type: string;
  label: string;
  weight: number;
}

/** A prep task on the output contract (drives prep reminders, §7). */
export interface RecommendationPrepTask {
  taskName: string;
  requiredBeforeMinutes: number;
  description: string | null;
}

/** A paired dish on the output contract (`dish_pairings`). */
export interface RecommendationPairing {
  dishId: string;
  pairingType: PairingType;
}

/** One ranked recommendation (design/05 § 9). */
export interface Recommendation {
  dishId: string;
  score: number;
  reason: string;
  missingConstraints: MissingConstraint[];
  prepTasks: RecommendationPrepTask[];
  pairedDishes: RecommendationPairing[];
}

// ───────────────────────────── engine input (§2) ─────────────────────────────

import type { RecommendationConfig } from "./config";

/**
 * Everything one per-slot recommendation run needs. The loaders assemble the
 * data fields; the caller supplies `now` (injected clock, design/05 § 11) and,
 * during weekly composition, the in-memory `usedThisRun` set (§10).
 */
export interface SlotRecommendationInput {
  household: HouseholdContext;
  members: MemberContext[];
  dishes: CandidateDish[];
  history: MealHistory;
  /** Target date as `YYYY-MM-DD`. */
  date: string;
  mealSlot: MealSlot;
  /** Injected clock — only meaningful for prep feasibility on "today" (§7). */
  now: Date;
  /** Dishes already chosen earlier in a weekly run; treated as recently cooked (§10). */
  usedThisRun?: ReadonlySet<string>;
  /**
   * Dish ids that belong to a *popular* active meal combination (P10) — they earn
   * the `popularDish` bonus alongside dishes whose own popularity clears the
   * config threshold. Empty/absent when the combinations feature is off.
   */
  popularCombinationDishIds?: ReadonlySet<string>;
  /**
   * Include dishes whose advance prep can no longer be finished in time instead of
   * hard-excluding them (BUG-031). Off for auto-suggestions (a suggested dish must
   * be cookable), ON for the manual "Plan a meal"/"Change" picker, where the user
   * is deliberately choosing and the dish is surfaced with a prep caveat rather
   * than silently dropped. The variety/diet/allergy rules still apply.
   */
  allowInfeasiblePrep?: boolean;
  /** Overrides the default tuned weights/thresholds (§11). */
  config?: RecommendationConfig;
}
