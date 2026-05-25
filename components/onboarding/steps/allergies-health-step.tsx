"use client";

import {
  Field,
  OptionChips,
  OptionGroup,
  TagInput,
} from "@/components/onboarding/fields";
import {
  HEALTH_TAG_OPTIONS,
  SPICE_LEVEL_OPTIONS,
  type AllergiesHealth,
} from "@/lib/onboarding";

/**
 * Step 4 — allergies and health (design/06 § 2). Fully optional and member-level
 * (this becomes the owner's `user_food_preferences` at completion). No medical
 * claims — "dietary preferences" only, per the privacy guidance.
 */
export function AllergiesHealthStep({
  value,
  onChange,
}: {
  value: AllergiesHealth;
  onChange: (patch: Partial<AllergiesHealth>) => void;
}) {
  return (
    <div className="flex flex-col gap-5">
      <Field
        label="Allergies"
        hint="Type an allergen and press Enter. We'll keep these out of suggestions."
      >
        <TagInput
          ariaLabel="Add an allergy"
          placeholder="e.g. peanuts"
          value={value.allergies}
          onChange={(allergies) => onChange({ allergies })}
        />
      </Field>

      <Field
        label="Disliked ingredients"
        hint="Ingredients you'd rather avoid."
      >
        <TagInput
          ariaLabel="Add a disliked ingredient"
          placeholder="e.g. okra"
          value={value.dislikedIngredients}
          onChange={(dislikedIngredients) => onChange({ dislikedIngredients })}
        />
      </Field>

      <Field
        label="Dietary goals"
        hint="Preferences we'll favor — not medical advice."
      >
        <OptionChips
          ariaLabel="Dietary goals"
          options={HEALTH_TAG_OPTIONS}
          value={value.healthPreferenceTags}
          onChange={(healthPreferenceTags) =>
            onChange({ healthPreferenceTags })
          }
        />
      </Field>

      <Field label="Your spice preference">
        <OptionGroup
          ariaLabel="Your spice preference"
          options={SPICE_LEVEL_OPTIONS}
          value={value.spicePreference}
          onChange={(spicePreference) => onChange({ spicePreference })}
        />
      </Field>
    </div>
  );
}
