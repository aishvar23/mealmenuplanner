/**
 * Onboarding draft payload shape — the `household_profile_drafts.draft_data`
 * JSON, keyed by step (design/06 § 3). Pure types plus the empty seed; the
 * wizard holds this in memory (P2-1) and the draft API (P2-2/P2-3) persists and
 * rehydrates the exact same shape.
 *
 * Every field is optional because a draft is, by definition, partial — the user
 * fills it in across steps and sessions. Enum-typed fields reuse the generated
 * DB enums so the wizard can't offer a value the schema would reject; the values
 * themselves are stored verbatim (camelCase keys, enum values unchanged — the
 * translation boundary in design/04 § 1).
 */

import type { Database } from "@/lib/db/database.types";

type DietType = Database["public"]["Enums"]["diet_type"];
type SpiceLevel = Database["public"]["Enums"]["spice_level"];
type BudgetPreference = Database["public"]["Enums"]["budget_preference"];
type MealSlot = Database["public"]["Enums"]["meal_slot"];
type MealFrequency = Database["public"]["Enums"]["meal_frequency"];

/** Step 1 — maps onto `households` + `household_preferences` (design/06 § 2). */
export interface HouseholdBasics {
  name?: string;
  familySize?: number;
  adultsCount?: number;
  kidsCount?: number;
  /** ISO country code, e.g. `"IN"`. */
  locationCountry?: string;
  locationCity?: string;
}

/** Step 2 — `household_preferences` diet/cuisine/spice. */
export interface FoodPreferences {
  dietType?: DietType;
  preferredCuisines?: string[];
  spiceLevel?: SpiceLevel;
}

/**
 * One self-built meal in `build` mode (P10): a main dish the household picked,
 * how often it wants it, when it's suitable to serve, and the accompaniments it
 * "goes with" (all dish names).
 */
export interface SelfBuiltDish {
  /** The main dish's name. */
  dishName: string;
  /** How often the household wants this dish in rotation. */
  frequency: MealFrequency;
  /**
   * Meal slots this dish is suitable for (P10-8). Empty = no restriction (the
   * dish keeps its global `dishes.meal_slots` behavior); a non-empty list
   * hard-filters the engine so the dish is only ever suggested in these slots.
   */
  suitableFor: MealSlot[];
  /** Accompaniment dish names (breads/sides/condiments it pairs with). */
  goesWith: string[];
}

/**
 * One selected meal combination in `combinations` mode (P10-9): the admin-curated
 * combination plus the household's plate-level preferences for it — how often it
 * wants the plate and the meal slots it's suitable for. This mirrors the per-dish
 * controls of `build` mode **minus "goes with"** (a combination already fixes the
 * dishes that go together). On completion the frequency + suitable slots are
 * applied to every dish in the combination (`household_dish_preferences`).
 */
export interface SelectedCombination {
  /** The admin-curated combination's id. */
  combinationId: string;
  /**
   * The combination's display name, captured at pick time (BUG-024). Lets the
   * Review step list chosen combinations by name without re-fetching the
   * catalog; resumed pre-BUG-024 drafts may omit it (resolved from the catalog
   * or shown generically). Display-only — never written to the DB.
   */
  name?: string;
  /** How often the household wants this combination in rotation. */
  frequency: MealFrequency;
  /**
   * Meal slots this combination is suitable for (mirrors {@link SelfBuiltDish}).
   * Empty = no restriction; a non-empty list hard-filters the engine.
   */
  suitableFor: MealSlot[];
}

/**
 * Step 3 — preferred dishes (BUG-006 + P10 + BUG-026). The three slices below are
 * **additive**: a household can both pick combinations and build its own dishes,
 * and switching `mode` no longer wipes the other slices (BUG-026). `mode` is just
 * the picker currently open for editing; completion and Review merge **every**
 * populated slice.
 *   • `combinations` — pick admin-curated meal combinations (popularity-ranked),
 *     each tagged with a frequency tier + the slots it's "suitable for" (P10-9).
 *     Selecting bumps each combo's popularity and writes those plate-level prefs
 *     onto every member dish (`selectedCombinations` → `household_dish_preferences`).
 *   • `build` — pick main dishes and tag each with a frequency tier + the
 *     accompaniments it goes with (`builtDishes` → `household_dish_preferences` /
 *     `household_dish_accompaniments`; the mains also become `liked_dishes`).
 *   • `system` — delegate everything to the recommendation engine. Exclusive:
 *     choosing it clears the explicit picks (ONB-043).
 *   • `manual` — legacy hand-pick (retained for resumed/edit drafts); the picks
 *     are dish **names** the engine's liked-dish bonus matches on
 *     (`lib/recommendation/scoring.ts`) → the owner's `liked_dishes`.
 */
export interface PreferredDishes {
  mode?: "combinations" | "build" | "system" | "manual";
  /** Dish names the household likes (legacy `manual` mode). */
  dishNames?: string[];
  /**
   * Selected meal combinations + plate-level prefs (`combinations` mode, P10-9).
   */
  selectedCombinations?: SelectedCombination[];
  /**
   * @deprecated Pre-P10-9 `combinations`-mode shape (ids only, no frequency/slots).
   * Superseded by {@link selectedCombinations}; still read when rehydrating an
   * older draft so a resumed session doesn't lose its picks.
   */
  selectedCombinationIds?: string[];
  /** The household's self-built dishes (`build` mode). */
  builtDishes?: SelfBuiltDish[];
}

/** Step 3 — `household_preferences` meals + cooking time + variety. */
export interface MealSchedule {
  mealsToPlan?: MealSlot[];
  weekdayCookingTimeMinutes?: number;
  weekendCookingTimeMinutes?: number;
  varietyGapDays?: number;
  allowLeftovers?: boolean;
}

/** Step 4 — the owner's `user_food_preferences` (member-level, optional). */
export interface AllergiesHealth {
  allergies?: string[];
  dislikedIngredients?: string[];
  healthPreferenceTags?: string[];
  spicePreference?: SpiceLevel;
}

/** Step 5 — `household_preferences.budget_preference` (optional). */
export interface BudgetSection {
  budgetPreference?: BudgetPreference;
}

/**
 * The full draft payload (design/06 § 3). One optional slice per data-bearing
 * step; the Review step holds no data of its own.
 */
export interface DraftData {
  householdBasics?: HouseholdBasics;
  foodPreferences?: FoodPreferences;
  preferredDishes?: PreferredDishes;
  mealSchedule?: MealSchedule;
  allergiesHealth?: AllergiesHealth;
  budget?: BudgetSection;
}

/** A brand-new draft: nothing entered yet. */
export const EMPTY_DRAFT_DATA: DraftData = {};
