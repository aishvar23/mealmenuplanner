"use client";

import { useEffect, useRef } from "react";

import { Field, NumberInput } from "@/components/onboarding/fields";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import {
  COUNTRIES,
  resolveLocationFromTimeZone,
  type HouseholdBasics,
} from "@/lib/onboarding";

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

  // BUG-020: on first open of a fresh create-mode draft, seed the name + location
  // from the browser timezone so the user starts with sensible defaults instead
  // of blank/placeholder fields. Runs once and only fills fields still empty, so a
  // resumed draft (or anything the user typed) is never overwritten.
  const seeded = useRef(false);
  useEffect(() => {
    if (editing || seeded.current) return;
    seeded.current = true;

    const timeZone =
      typeof Intl !== "undefined"
        ? Intl.DateTimeFormat().resolvedOptions().timeZone
        : undefined;
    const resolved = resolveLocationFromTimeZone(timeZone);

    const patch: Partial<HouseholdBasics> = {};
    if (!value.name?.trim()) {
      patch.name = resolved?.city
        ? `${resolved.city} Household`
        : "My Household";
    }
    if (!value.locationCountry && resolved?.countryCode) {
      patch.locationCountry = resolved.countryCode;
    }
    if (!value.locationCity?.trim() && resolved?.city) {
      patch.locationCity = resolved.city;
    }
    if (Object.keys(patch).length > 0) onChange(patch);
    // Run-once-on-mount: deliberately excludes value/onChange so re-renders (and
    // the user later clearing a field) never re-seed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
            <Select
              id="location-country"
              autoComplete="country"
              value={value.locationCountry ?? ""}
              onChange={(event) =>
                onChange({ locationCountry: event.target.value })
              }
            >
              <option value="">Select country</option>
              {COUNTRIES.map((country) => (
                <option key={country.code} value={country.code}>
                  {country.name}
                </option>
              ))}
            </Select>
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
