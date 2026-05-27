"use client";

import {
  FrequencyField,
  SuitableForField,
} from "@/components/onboarding/cards/dish-config-fields";
import type { Database } from "@/lib/db/database.types";

type MealFrequency = Database["public"]["Enums"]["meal_frequency"];
type MealSlot = Database["public"]["Enums"]["meal_slot"];

/**
 * The per-combination config shown under a selected combination card (P10-9): how
 * often the household wants this plate and the meal slots it's suitable for. This
 * replicates the build-mode per-dish config (`BuildDishConfig`) **minus "goes
 * with"** — a combination already fixes the dishes that go together. Pure UI;
 * selection state lives in the wizard's draft (`SelectedCombination`).
 */
export function CombinationConfig({
  frequency,
  suitableFor,
  onFrequencyChange,
  onToggleSlot,
}: {
  frequency: MealFrequency;
  /** Meal slots the combination is suitable for; empty = any of its usual times. */
  suitableFor: MealSlot[];
  onFrequencyChange: (frequency: MealFrequency) => void;
  onToggleSlot: (slot: MealSlot) => void;
}) {
  return (
    <div className="flex flex-col gap-3 text-sm">
      <FrequencyField
        frequency={frequency}
        onFrequencyChange={onFrequencyChange}
      />
      <SuitableForField suitableFor={suitableFor} onToggleSlot={onToggleSlot} />
    </div>
  );
}
