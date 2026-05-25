"use client";

import {
  BooleanToggle,
  Field,
  NumberInput,
  OptionChips,
} from "@/components/onboarding/fields";
import { MEAL_SLOT_OPTIONS, type MealSchedule } from "@/lib/onboarding";

/**
 * Step 3 — meals and cooking time (design/06 § 2). `mealsToPlan` (≥1 slot) and
 * `weekdayCookingTimeMinutes` are required; the weekend time, variety gap, and
 * leftovers toggle are optional (the engine falls back to the weekday time and
 * default gap when omitted).
 */
export function MealScheduleStep({
  value,
  onChange,
}: {
  value: MealSchedule;
  onChange: (patch: Partial<MealSchedule>) => void;
}) {
  return (
    <div className="flex flex-col gap-5">
      <Field label="Meals to plan" required hint="Pick at least one.">
        <OptionChips
          ariaLabel="Meals to plan"
          options={MEAL_SLOT_OPTIONS}
          value={value.mealsToPlan}
          onChange={(mealsToPlan) => onChange({ mealsToPlan })}
        />
      </Field>

      <div className="grid grid-cols-2 gap-4">
        <Field
          label="Weekday cooking time"
          htmlFor="weekday-cooking-time"
          required
          hint="Minutes you usually have."
        >
          <NumberInput
            id="weekday-cooking-time"
            min={1}
            placeholder="45"
            value={value.weekdayCookingTimeMinutes}
            onChange={(weekdayCookingTimeMinutes) =>
              onChange({ weekdayCookingTimeMinutes })
            }
          />
        </Field>
        <Field
          label="Weekend cooking time"
          htmlFor="weekend-cooking-time"
          hint="Optional — defaults to weekday."
        >
          <NumberInput
            id="weekend-cooking-time"
            min={1}
            placeholder="90"
            value={value.weekendCookingTimeMinutes}
            onChange={(weekendCookingTimeMinutes) =>
              onChange({ weekendCookingTimeMinutes })
            }
          />
        </Field>
      </div>

      <Field
        label="Variety gap (days)"
        htmlFor="variety-gap-days"
        hint="Don't repeat a dish within this many days (0–60, default 7)."
      >
        <NumberInput
          id="variety-gap-days"
          min={0}
          max={60}
          placeholder="7"
          value={value.varietyGapDays}
          onChange={(varietyGapDays) => onChange({ varietyGapDays })}
        />
      </Field>

      <Field label="Allow leftovers?" hint="Repeat a cooked dish as leftovers.">
        <BooleanToggle
          ariaLabel="Allow leftovers"
          value={value.allowLeftovers}
          onChange={(allowLeftovers) => onChange({ allowLeftovers })}
        />
      </Field>
    </div>
  );
}
