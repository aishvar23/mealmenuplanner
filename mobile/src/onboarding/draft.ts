import type { BudgetPreference, DietType, MealSlot, SpiceLevel } from "@/api";

/**
 * Onboarding draft payload shape (design/06 § 3) — the
 * `household_profile_drafts.draft_data` JSON, keyed by step. Hand-authored mirror
 * of the web's `lib/onboarding/draft.ts` (the wizard's in-memory model), kept in
 * lockstep with it. Enum values use the wire-format string unions from `@/api`.
 *
 * The mobile wizard covers the six steps of design/06 § 2; the P10
 * preferred-dishes catalog step is dish-preference setup (M2-3), not part of the
 * minimum-required create flow, so it is omitted here. Completion treats it as
 * optional (the engine picks dishes when no explicit list is built).
 *
 * Every field is optional: a draft is partial by definition, filled in across
 * steps and sessions.
 */

/** Step 1 — `households` + `household_preferences` basics. */
export interface HouseholdBasics {
  name?: string;
  familySize?: number;
  adultsCount?: number;
  kidsCount?: number;
  /** ISO country code, e.g. `"IN"`. */
  locationCountry?: string;
  locationCity?: string;
}

/** Step 2 — diet / cuisine / spice (`household_preferences`). */
export interface FoodPreferences {
  /** The household's diet(s); multi-select (BETA). At least one required to finish. */
  dietTypes?: DietType[];
  preferredCuisines?: string[];
  spiceLevel?: SpiceLevel;
}

/** Step 3 — meals + cooking time + variety (`household_preferences`). */
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
 * step; the Review step holds no data of its own. Unknown keys written by the web
 * wizard (e.g. `preferredDishes`) are preserved on save — we spread the loaded
 * `draftData` and only overwrite the slices the mobile wizard owns.
 */
export interface DraftData {
  householdBasics?: HouseholdBasics;
  foodPreferences?: FoodPreferences;
  mealSchedule?: MealSchedule;
  allergiesHealth?: AllergiesHealth;
  budget?: BudgetSection;
  /** Slices the web wizard owns (e.g. `preferredDishes`) round-trip untouched. */
  [key: string]: unknown;
}

/** A brand-new draft: nothing entered yet. */
export const EMPTY_DRAFT_DATA: DraftData = {};
