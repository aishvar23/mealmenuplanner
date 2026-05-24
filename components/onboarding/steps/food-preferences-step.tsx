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
 * Step 2 — food preferences (design/06 § 2). `dietType` and at least one
 * `preferredCuisines` entry are required; `spiceLevel` is optional (defaults to
 * `medium` at completion).
 */
export function FoodPreferencesStep({
  value,
  onChange,
}: {
  value: FoodPreferences;
  onChange: (patch: Partial<FoodPreferences>) => void;
}) {
  return (
    <div className="space-y-5">
      <Field label="Diet type" required>
        <OptionGroup
          ariaLabel="Diet type"
          options={DIET_TYPE_OPTIONS}
          value={value.dietType}
          onChange={(dietType) => onChange({ dietType })}
        />
      </Field>

      <Field
        label="Preferred cuisines"
        required
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
