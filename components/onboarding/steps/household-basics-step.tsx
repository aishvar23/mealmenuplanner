"use client";

import { Field, NumberInput } from "@/components/onboarding/fields";
import { Input } from "@/components/ui/input";
import type { HouseholdBasics } from "@/lib/onboarding";

/**
 * Step 1 — household basics (design/06 § 2). `name` and `familySize` are part of
 * the minimum required set; the head-count split and location are optional.
 * Validation enforcement lands in P2-5; here the required marker is advisory.
 *
 * In `edit` mode (re-editing an existing household's preferences) the name is
 * shown read-only and location is hidden: both live on the `households` row,
 * which the preferences PATCH does not update. Only the preference fields
 * (family size, head-count split) are editable.
 */
export function HouseholdBasicsStep({
  value,
  onChange,
  mode = "create",
  errors,
}: {
  value: HouseholdBasics;
  onChange: (patch: Partial<HouseholdBasics>) => void;
  mode?: "create" | "edit";
  /** Per-step validation messages, shown when advancing is attempted (BUG-004). */
  errors?: { name?: string | null; familySize?: string | null };
}) {
  const editing = mode === "edit";

  return (
    <div className="flex flex-col gap-5">
      <Field
        label="Household name"
        htmlFor="household-name"
        required={!editing}
        error={editing ? null : errors?.name}
        hint={
          editing
            ? "Managed from your household — not editable here."
            : undefined
        }
      >
        <Input
          id="household-name"
          type="text"
          autoComplete="off"
          placeholder="e.g. The Sharma Household"
          value={value.name ?? ""}
          onChange={(event) => onChange({ name: event.target.value })}
          disabled={editing}
          readOnly={editing}
        />
      </Field>

      <Field
        label="Family size"
        htmlFor="family-size"
        required
        error={errors?.familySize}
        hint="How many people you usually cook for (1–50)."
      >
        <NumberInput
          id="family-size"
          min={1}
          max={50}
          placeholder="4"
          value={value.familySize}
          onChange={(familySize) => onChange({ familySize })}
        />
      </Field>

      <div className="grid grid-cols-2 gap-4">
        <Field label="Adults" htmlFor="adults-count">
          <NumberInput
            id="adults-count"
            min={0}
            placeholder="2"
            value={value.adultsCount}
            onChange={(adultsCount) => onChange({ adultsCount })}
          />
        </Field>
        <Field label="Kids" htmlFor="kids-count">
          <NumberInput
            id="kids-count"
            min={0}
            placeholder="2"
            value={value.kidsCount}
            onChange={(kidsCount) => onChange({ kidsCount })}
          />
        </Field>
      </div>

      {editing ? null : (
        <div className="grid grid-cols-2 gap-4">
          <Field label="Country" htmlFor="location-country">
            <Input
              id="location-country"
              type="text"
              autoComplete="country-name"
              placeholder="India"
              value={value.locationCountry ?? ""}
              onChange={(event) =>
                onChange({ locationCountry: event.target.value })
              }
            />
          </Field>
          <Field label="City" htmlFor="location-city">
            <Input
              id="location-city"
              type="text"
              autoComplete="address-level2"
              placeholder="Pune"
              value={value.locationCity ?? ""}
              onChange={(event) =>
                onChange({ locationCity: event.target.value })
              }
            />
          </Field>
        </div>
      )}
    </div>
  );
}
