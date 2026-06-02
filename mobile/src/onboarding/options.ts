import type { BudgetPreference, DietType, MealSlot, SpiceLevel } from "@/api";

/**
 * Selectable option lists for the onboarding wizard — the user-facing choices for
 * each field, with display labels. Hand-authored mirror of the web's
 * `lib/onboarding/options.ts`; keep the value sets in lockstep with the DB enums
 * (`diet_type`, `spice_level`, `budget_preference`, `meal_slot`). Cuisines and
 * health tags are free-text `text[]` columns, so their lists are a curated
 * starting set, not enums.
 */

/** A single selectable choice: the stored value plus how we show it. */
export interface Option<T extends string = string> {
  value: T;
  label: string;
  /** Optional one-line helper shown under the label. */
  description?: string;
}

/** Diet types (multi-select; BETA), value set from the `diet_type` enum. */
export const DIET_TYPE_OPTIONS: readonly Option<DietType>[] = [
  { value: "vegetarian", label: "Vegetarian" },
  { value: "vegan", label: "Vegan" },
  { value: "eggetarian", label: "Eggetarian" },
  { value: "non_vegetarian", label: "Non-vegetarian" },
  { value: "jain", label: "Jain" },
  { value: "pescatarian", label: "Pescatarian" },
];

/** Spice levels (single-select), value set from the `spice_level` enum. */
export const SPICE_LEVEL_OPTIONS: readonly Option<SpiceLevel>[] = [
  { value: "mild", label: "Mild" },
  { value: "medium", label: "Medium" },
  { value: "spicy", label: "Spicy" },
];

/** Budget preferences (single-select), value set from the `budget_preference` enum. */
export const BUDGET_OPTIONS: readonly Option<BudgetPreference>[] = [
  { value: "low", label: "Budget-friendly", description: "Keep costs down" },
  { value: "medium", label: "Balanced", description: "A sensible mix" },
  { value: "high", label: "Premium", description: "Cost is less of a concern" },
];

/** Meal slots to plan (multi-select), value set from the `meal_slot` enum. */
export const MEAL_SLOT_OPTIONS: readonly Option<MealSlot>[] = [
  { value: "breakfast", label: "Breakfast" },
  { value: "lunch", label: "Lunch" },
  { value: "dinner", label: "Dinner" },
  { value: "snack", label: "Snack" },
];

/**
 * Curated cuisine starting set (multi-select). Free-text values stored in
 * `preferred_cuisines`; the list can grow as content is authored.
 */
export const CUISINE_OPTIONS: readonly Option[] = [
  "North Indian",
  "South Indian",
  "Gujarati",
  "Punjabi",
  "Bengali",
  "Maharashtrian",
  "Chinese",
  "Italian",
  "Continental",
  "Mexican",
  "Thai",
  "Mediterranean",
].map((value) => ({ value, label: value }));

/**
 * Health preference tags (multi-select). Values mirror the boolean dish flags the
 * recommendation engine scores against, stored as free-text in
 * `user_food_preferences.health_preference_tags`.
 */
export const HEALTH_TAG_OPTIONS: readonly Option[] = [
  { value: "high_protein", label: "High protein" },
  { value: "low_sodium", label: "Low sodium" },
  { value: "low_carb", label: "Low carb" },
  { value: "diabetic_friendly", label: "Diabetic-friendly" },
];

/** Find an option's display label by value, falling back to the raw value. */
export function optionLabel(options: readonly Option[], value: string): string {
  return options.find((option) => option.value === value)?.label ?? value;
}
