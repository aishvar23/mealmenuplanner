"use client";

import { OptionGroup } from "@/components/onboarding/fields";
import {
  MEAL_FILTER_OPTIONS,
  type MealFilter,
} from "@/lib/meal-plan/meal-filter";

/**
 * Single-select pill row for the top-level meal "goal" filter (All /
 * Weight-loss / Protein-rich). A thin wrapper over the onboarding `OptionGroup`
 * (a required radiogroup — "All" is always present, so a choice can't be
 * un-set) so the chip markup, styling tokens, and accessibility live in one
 * place. Shared by the onboarding preferred-dishes step and the Today/Weekly
 * "Change meal" picker.
 */
export function MealFilterChips({
  value,
  onChange,
}: {
  value: MealFilter;
  onChange: (value: MealFilter) => void;
}) {
  return (
    <OptionGroup
      options={MEAL_FILTER_OPTIONS}
      value={value}
      onChange={onChange}
      ariaLabel="Filter dishes by goal"
    />
  );
}
