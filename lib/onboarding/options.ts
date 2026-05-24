/**
 * Selectable option lists for the onboarding wizard — the user-facing choices
 * for each enum/free-text field, with display labels. Pure data, client-safe.
 *
 * Enum-backed fields (diet, spice, budget, meal slot) derive their value set
 * from the generated `Constants` so the wizard can never offer a value the
 * `household_preferences` schema rejects, and a new enum value forces a label
 * here (the label maps are exhaustive `Record`s — TS errors on a missing key).
 *
 * Cuisines and health tags are stored as free-text arrays in the DB (design/01:
 * cuisines/regions stay `text[]` to grow with content), so their option lists
 * are a curated starting set, not an enum — values are plain strings.
 */

import { Constants } from "@/lib/db/database.types";
import type { Database } from "@/lib/db/database.types";

type DietType = Database["public"]["Enums"]["diet_type"];
type SpiceLevel = Database["public"]["Enums"]["spice_level"];
type BudgetPreference = Database["public"]["Enums"]["budget_preference"];
type MealSlot = Database["public"]["Enums"]["meal_slot"];

/** A single selectable choice: the stored value plus how we show it. */
export interface Option<T extends string = string> {
  value: T;
  label: string;
  /** Optional one-line helper shown under the label. */
  description?: string;
}

const DIET_TYPE_LABELS: Record<DietType, string> = {
  vegetarian: "Vegetarian",
  vegan: "Vegan",
  eggetarian: "Eggetarian",
  non_vegetarian: "Non-vegetarian",
  jain: "Jain",
  pescatarian: "Pescatarian",
};

const SPICE_LEVEL_LABELS: Record<SpiceLevel, string> = {
  mild: "Mild",
  medium: "Medium",
  spicy: "Spicy",
};

const BUDGET_LABELS: Record<BudgetPreference, { label: string; hint: string }> =
  {
    low: { label: "Budget-friendly", hint: "Keep costs down" },
    medium: { label: "Balanced", hint: "A sensible mix" },
    high: { label: "Premium", hint: "Cost is less of a concern" },
  };

const MEAL_SLOT_LABELS: Record<MealSlot, string> = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  dinner: "Dinner",
  snack: "Snack",
};

/** Diet types (single-select), value set from the `diet_type` enum. */
export const DIET_TYPE_OPTIONS: readonly Option<DietType>[] =
  Constants.public.Enums.diet_type.map((value) => ({
    value,
    label: DIET_TYPE_LABELS[value],
  }));

/** Spice levels (single-select), value set from the `spice_level` enum. */
export const SPICE_LEVEL_OPTIONS: readonly Option<SpiceLevel>[] =
  Constants.public.Enums.spice_level.map((value) => ({
    value,
    label: SPICE_LEVEL_LABELS[value],
  }));

/** Budget preferences (single-select), value set from the `budget_preference` enum. */
export const BUDGET_OPTIONS: readonly Option<BudgetPreference>[] =
  Constants.public.Enums.budget_preference.map((value) => ({
    value,
    label: BUDGET_LABELS[value].label,
    description: BUDGET_LABELS[value].hint,
  }));

/** Meal slots to plan (multi-select), value set from the `meal_slot` enum. */
export const MEAL_SLOT_OPTIONS: readonly Option<MealSlot>[] =
  Constants.public.Enums.meal_slot.map((value) => ({
    value,
    label: MEAL_SLOT_LABELS[value],
  }));

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
 * Health preference tags (multi-select). Values mirror the boolean dish flags
 * the recommendation engine scores against (design/01 `dishes`), stored as
 * free-text in `user_food_preferences.health_preference_tags`.
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
