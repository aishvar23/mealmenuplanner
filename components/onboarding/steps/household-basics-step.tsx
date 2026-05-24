"use client";

import { Field, NumberInput } from "@/components/onboarding/fields";
import { Input } from "@/components/ui/input";
import type { HouseholdBasics } from "@/lib/onboarding";

/**
 * Step 1 — household basics (design/06 § 2). `name` and `familySize` are part of
 * the minimum required set; the head-count split and location are optional.
 * Validation enforcement lands in P2-5; here the required marker is advisory.
 */
export function HouseholdBasicsStep({
  value,
  onChange,
}: {
  value: HouseholdBasics;
  onChange: (patch: Partial<HouseholdBasics>) => void;
}) {
  return (
    <div className="space-y-5">
      <Field label="Household name" htmlFor="household-name" required>
        <Input
          id="household-name"
          type="text"
          autoComplete="off"
          placeholder="e.g. The Suhane Household"
          value={value.name ?? ""}
          onChange={(event) => onChange({ name: event.target.value })}
        />
      </Field>

      <Field
        label="Family size"
        htmlFor="family-size"
        required
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
            onChange={(event) => onChange({ locationCity: event.target.value })}
          />
        </Field>
      </div>
    </div>
  );
}
