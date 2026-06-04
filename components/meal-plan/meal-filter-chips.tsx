"use client";

import {
  MEAL_FILTER_OPTIONS,
  type MealFilter,
} from "@/lib/meal-plan/meal-filter";
import { cn } from "@/lib/utils";

/**
 * Single-select pill row for the top-level meal "goal" filter (All /
 * Weight-loss / Protein-rich). Mirrors the onboarding `OptionGroup` convention
 * (a required radiogroup — "All" is always present, so a choice can't be
 * un-set). Shared by the onboarding preferred-dishes step and the Today/Weekly
 * "Change meal" picker. Styling tokens match `components/onboarding/fields.tsx`.
 */

const chipBase =
  "rounded-lg border px-3 py-2 text-sm font-bold transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/25 disabled:pointer-events-none disabled:opacity-50";
const chipSelected =
  "border-primary bg-primary text-primary-foreground shadow-xs";
const chipUnselected =
  "border-border bg-card text-foreground hover:border-primary/30 hover:bg-primary/5 hover:text-primary";

export function MealFilterChips({
  value,
  onChange,
}: {
  value: MealFilter;
  onChange: (value: MealFilter) => void;
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Filter dishes by goal"
      className="flex flex-wrap gap-2"
    >
      {MEAL_FILTER_OPTIONS.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(option.value)}
            className={cn(chipBase, selected ? chipSelected : chipUnselected)}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
