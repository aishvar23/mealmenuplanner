"use client";

import {
  Field,
  OptionChips,
  OptionGroup,
} from "@/components/onboarding/fields";
import {
  CUISINE_OPTIONS,
  DIET_TYPE_OPTIONS,
  SPICE_LEVEL_OPTIONS,
  type FoodPreferences,
} from "@/lib/onboarding";

/**
 * Step 2 — food preferences (design/06 § 2). At least one `dietTypes` entry and
 * at least one `preferredCuisines` entry are required; `spiceLevel` is optional
 * (defaults to `medium` at completion). Diet is multi-select (BETA) so a
 * household that eats both vegetarian and non-vegetarian can pick both.
 */
export function FoodPreferencesStep({
  value,
  onChange,
  errors,
}: {
  value: FoodPreferences;
  onChange: (patch: Partial<FoodPreferences>) => void;
  /** Per-step validation messages, shown when advancing is attempted (BUG-004). */
  errors?: { dietType?: string | null; preferredCuisines?: string | null };
}) {
  return (
    <div className="flex flex-col gap-5">
      <Field
        label="Diet type"
        required
        error={errors?.dietType}
        hint="Pick all that apply — e.g. both vegetarian and non-vegetarian."
      >
        <OptionChips
          ariaLabel="Diet type"
          options={DIET_TYPE_OPTIONS}
          value={value.dietTypes ?? []}
          onChange={(dietTypes) => onChange({ dietTypes })}
        />
      </Field>

      <Field
        label="Preferred cuisines"
        required
        error={errors?.preferredCuisines}
        hint="Pick at least one — you can add more later."
      >
        <OptionChips
          ariaLabel="Preferred cuisines"
          options={CUISINE_OPTIONS}
          value={value.preferredCuisines}
          onChange={(preferredCuisines) => onChange({ preferredCuisines })}
        />
      </Field>

      <Field label="Spice level">
        <OptionGroup
          ariaLabel="Spice level"
          options={SPICE_LEVEL_OPTIONS}
          value={value.spiceLevel}
          onChange={(spiceLevel) => onChange({ spiceLevel })}
        />
      </Field>
    </div>
  );
}
