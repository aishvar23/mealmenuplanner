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

export type DietType = Database["public"]["Enums"]["diet_type"];
export type DifficultyLevel = Database["public"]["Enums"]["difficulty_level"];
export type MealSlot = Database["public"]["Enums"]["meal_slot"];
export type PairingType = Database["public"]["Enums"]["pairing_type"];
export type ImageStatus = Database["public"]["Enums"]["image_status"];

// ───────────────────────────── loaded inputs (§3) ─────────────────────────────

/**
 * Household-level inputs from `household_preferences` (design/05 § 3.1). One row
 * per household; the applicable cooking-time limit is chosen by weekday/weekend.
 */
export interface HouseholdContext {
  dietType: DietType;
  preferredCuisines: string[];
  weekdayCookingTimeMinutes: number | null;
  weekendCookingTimeMinutes: number | null;
  varietyGapDays: number;
  kidsCount: number;
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
  /** Stored-generated `prep + cook` (design/01); null only if unset. */
  totalTimeMinutes: number | null;
  difficulty: DifficultyLevel;
  kidFriendly: boolean;
  lunchboxFriendly: boolean;
  imageUrl: string | null;
  imageAltText: string | null;
  imageStatus: ImageStatus;
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
  /** Overrides the default tuned weights/thresholds (§11). */
  config?: RecommendationConfig;
}
