"use client";

import type { Database } from "@/lib/db/database.types";
import { cn } from "@/lib/utils";

type MealFrequency = Database["public"]["Enums"]["meal_frequency"];
type MealSlot = Database["public"]["Enums"]["meal_slot"];

/** Frequency tiers in display order — mirrors the `meal_frequency` enum (P10). */
export const FREQUENCY_OPTIONS: { value: MealFrequency; label: string }[] = [
  { value: "daily", label: "Daily" },
  { value: "once_a_week", label: "Once a week" },
  { value: "once_in_a_while", label: "Once in a while" },
];

/**
 * The meal slots a household can mark a built dish or combination "suitable for"
 * (P10-8). Limited to the three main meals; selecting none means "any of its usual
 * times".
 */
export const SUITABLE_SLOT_OPTIONS: { value: MealSlot; label: string }[] = [
  { value: "breakfast", label: "Breakfast" },
  { value: "lunch", label: "Lunch" },
  { value: "dinner", label: "Dinner" },
];

/** A round, single-line toggle chip used by both config fields. */
function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "rounded-full border px-2.5 py-1 text-xs transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/25",
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border bg-background hover:border-primary/40",
      )}
    >
      {children}
    </button>
  );
}

/**
 * The shared "How often?" frequency picker (P10). Used by both the build-mode
 * per-dish config and the combinations-mode per-combination config so the two
 * stay visually identical.
 */
export function FrequencyField({
  frequency,
  onFrequencyChange,
}: {
  frequency: MealFrequency;
  onFrequencyChange: (frequency: MealFrequency) => void;
}) {
  return (
    <div>
      <p className="mb-1.5 text-xs font-medium text-muted-foreground">
        How often?
      </p>
      <div className="flex flex-wrap gap-1.5">
        {FREQUENCY_OPTIONS.map((option) => (
          <Chip
            key={option.value}
            active={frequency === option.value}
            onClick={() => onFrequencyChange(option.value)}
          >
            {option.label}
          </Chip>
        ))}
      </div>
    </div>
  );
}

/**
 * The shared "Suitable for" meal-slot picker (P10-8). Empty selection means "any
 * of its usual times"; picking slots hard-limits when the engine may suggest it.
 */
export function SuitableForField({
  suitableFor,
  onToggleSlot,
}: {
  suitableFor: MealSlot[];
  onToggleSlot: (slot: MealSlot) => void;
}) {
  return (
    <div>
      <p className="mb-1.5 text-xs font-medium text-muted-foreground">
        Suitable for
      </p>
      <div className="flex flex-wrap gap-1.5">
        {SUITABLE_SLOT_OPTIONS.map((option) => (
          <Chip
            key={option.value}
            active={suitableFor.includes(option.value)}
            onClick={() => onToggleSlot(option.value)}
          >
            {option.label}
          </Chip>
        ))}
      </div>
      <p className="mt-1 text-[0.7rem] text-muted-foreground">
        {suitableFor.length === 0
          ? "Any of its usual times — tap to limit when it's suggested."
          : "Only suggested at the times you picked."}
      </p>
    </div>
  );
}
