/**
 * Operator-console option lists + display labels — the user-facing choices for
 * each dish/ingredient enum field. Pure data, client-safe (derives value sets
 * from the generated `Constants`, so a new enum value forces a label here — the
 * label maps are exhaustive `Record`s that TS errors on if a key is missing).
 */

import { Constants } from "@/lib/db/database.types";
import type { Database } from "@/lib/db/database.types";

type DietType = Database["public"]["Enums"]["diet_type"];
type SpiceLevel = Database["public"]["Enums"]["spice_level"];
type DifficultyLevel = Database["public"]["Enums"]["difficulty_level"];
type MealSlot = Database["public"]["Enums"]["meal_slot"];
type DishStatus = Database["public"]["Enums"]["dish_status"];
type PairingType = Database["public"]["Enums"]["pairing_type"];

export interface Option<T extends string = string> {
  value: T;
  label: string;
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

const DIFFICULTY_LABELS: Record<DifficultyLevel, string> = {
  easy: "Easy",
  medium: "Medium",
  hard: "Hard",
};

const MEAL_SLOT_LABELS: Record<MealSlot, string> = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  dinner: "Dinner",
  snack: "Snack",
};

const DISH_STATUS_LABELS: Record<DishStatus, string> = {
  draft: "Draft",
  active: "Active",
  archived: "Archived",
};

const PAIRING_TYPE_LABELS: Record<PairingType, string> = {
  main_side: "Main + side",
  rice_pairing: "Rice",
  bread_pairing: "Bread",
  condiment: "Condiment",
  beverage: "Beverage",
};

function toOptions<T extends string>(
  values: readonly T[],
  labels: Record<T, string>,
): readonly Option<T>[] {
  return values.map((value) => ({ value, label: labels[value] }));
}

export const DIET_TYPE_OPTIONS = toOptions(
  Constants.public.Enums.diet_type,
  DIET_TYPE_LABELS,
);
export const SPICE_LEVEL_OPTIONS = toOptions(
  Constants.public.Enums.spice_level,
  SPICE_LEVEL_LABELS,
);
export const DIFFICULTY_OPTIONS = toOptions(
  Constants.public.Enums.difficulty_level,
  DIFFICULTY_LABELS,
);
export const MEAL_SLOT_OPTIONS = toOptions(
  Constants.public.Enums.meal_slot,
  MEAL_SLOT_LABELS,
);
export const DISH_STATUS_OPTIONS = toOptions(
  Constants.public.Enums.dish_status,
  DISH_STATUS_LABELS,
);
export const PAIRING_TYPE_OPTIONS = toOptions(
  Constants.public.Enums.pairing_type,
  PAIRING_TYPE_LABELS,
);

export function dietTypeLabel(value: DietType): string {
  return DIET_TYPE_LABELS[value];
}
export function dishStatusLabel(value: DishStatus): string {
  return DISH_STATUS_LABELS[value];
}
export function mealSlotLabel(value: string): string {
  return (MEAL_SLOT_LABELS as Record<string, string>)[value] ?? value;
}
export function pairingTypeLabel(value: PairingType): string {
  return PAIRING_TYPE_LABELS[value];
}

/**
 * Ingredient categories (design/01 `ingredients.category` value set comment).
 * Stored as free-text, so this is a curated starting set, not an enum.
 */
export const INGREDIENT_CATEGORIES: readonly string[] = [
  "vegetables",
  "fruits",
  "dairy",
  "grains",
  "lentils",
  "spices",
  "eggs_meat",
  "pantry",
];
