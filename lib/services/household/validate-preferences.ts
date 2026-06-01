/**
 * Preferences-update validation + inbound translation (camelCase → snake_case),
 * the input half of the `household` translation boundary (design/04 § 1). Pure
 * and I/O-free — no `server-only`, no Supabase — so it is trivially unit-testable
 * and the service layer just calls it.
 *
 * Every rule mirrors a `household_preferences` CHECK / enum / type from doc 01,
 * so the service rejects bad input with a typed `ValidationError` before it ever
 * reaches Postgres (the DB constraints stay the independent backstop). Enum value
 * sets come from the generated `Constants` so they can never drift from the
 * schema.
 */

import { Constants } from "@/lib/db/database.types";
import { ValidationError, type ValidationIssue } from "@/lib/errors";
import type { JsonObject } from "@/lib/http";

import type { PreferencesRow } from "./dto";

const DIET_TYPES = Constants.public.Enums.diet_type;
const SPICE_LEVELS = Constants.public.Enums.spice_level;
const BUDGET_PREFERENCES = Constants.public.Enums.budget_preference;
const MEAL_SLOTS = Constants.public.Enums.meal_slot;

/**
 * The editable subset of `household_preferences`, in DB-native snake_case, all
 * optional — a PATCH may carry any subset of fields. Assignable to the table's
 * `Update` type, so it feeds `supabase.update()` directly.
 */
export type EditablePreferences = Partial<PreferencesRow>;

function isInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value);
}

function isStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) && value.every((item) => typeof item === "string")
  );
}

function isEnumValue<T extends string>(
  value: unknown,
  allowed: readonly T[],
): value is T {
  return (
    typeof value === "string" && (allowed as readonly string[]).includes(value)
  );
}

/**
 * Validate + translate a PATCH preferences body into the snake_case update.
 *
 * Reads only the recognized preference fields (unknown keys are ignored), so the
 * result is exactly the subset the caller wants to change. Collects **all** field
 * issues and throws a single `ValidationError` carrying them; also throws when no
 * recognized field is present (an empty update is meaningless and would be an
 * invalid SQL `SET`).
 */
export function buildPreferencesUpdate(body: JsonObject): EditablePreferences {
  const issues: ValidationIssue[] = [];
  const update: EditablePreferences = {};

  const has = (key: string): boolean => Object.hasOwn(body, key);

  if (has("familySize")) {
    const value = body.familySize;
    if (isInteger(value) && value >= 1 && value <= 50) {
      update.family_size = value;
    } else {
      issues.push({ field: "familySize", rule: "range", min: 1, max: 50 });
    }
  }

  if (has("adultsCount")) {
    const value = body.adultsCount;
    if (isInteger(value) && value >= 0) {
      update.adults_count = value;
    } else {
      issues.push({ field: "adultsCount", rule: "min", min: 0 });
    }
  }

  if (has("kidsCount")) {
    const value = body.kidsCount;
    if (isInteger(value) && value >= 0) {
      update.kids_count = value;
    } else {
      issues.push({ field: "kidsCount", rule: "min", min: 0 });
    }
  }

  // Multi-diet households (BETA): the PATCH carries `dietTypes` (a non-empty array
  // of valid enums). We write `diet_types` as the source of truth and mirror the
  // first element into the legacy scalar `diet_type`.
  if (has("dietTypes")) {
    const value = body.dietTypes;
    if (
      Array.isArray(value) &&
      value.length > 0 &&
      value.every((item) => isEnumValue(item, DIET_TYPES))
    ) {
      const dietTypes = value as (typeof DIET_TYPES)[number][];
      update.diet_types = dietTypes;
      update.diet_type = dietTypes[0];
    } else {
      issues.push({
        field: "dietTypes",
        rule: "enumArray",
        allowed: DIET_TYPES,
      });
    }
  }

  if (has("preferredCuisines")) {
    const value = body.preferredCuisines;
    if (isStringArray(value)) {
      update.preferred_cuisines = value;
    } else {
      issues.push({ field: "preferredCuisines", rule: "stringArray" });
    }
  }

  if (has("spiceLevel")) {
    const value = body.spiceLevel;
    if (isEnumValue(value, SPICE_LEVELS)) {
      update.spice_level = value;
    } else {
      issues.push({ field: "spiceLevel", rule: "enum", allowed: SPICE_LEVELS });
    }
  }

  // Cooking times are nullable positive ints: `null` clears the value.
  if (has("weekdayCookingTimeMinutes")) {
    const value = body.weekdayCookingTimeMinutes;
    if (value === null || (isInteger(value) && value > 0)) {
      update.weekday_cooking_time_minutes = value;
    } else {
      issues.push({
        field: "weekdayCookingTimeMinutes",
        rule: "positiveIntOrNull",
      });
    }
  }

  if (has("weekendCookingTimeMinutes")) {
    const value = body.weekendCookingTimeMinutes;
    if (value === null || (isInteger(value) && value > 0)) {
      update.weekend_cooking_time_minutes = value;
    } else {
      issues.push({
        field: "weekendCookingTimeMinutes",
        rule: "positiveIntOrNull",
      });
    }
  }

  if (has("mealsToPlan")) {
    const value = body.mealsToPlan;
    if (
      isStringArray(value) &&
      value.every((slot) => (MEAL_SLOTS as readonly string[]).includes(slot))
    ) {
      update.meals_to_plan = value;
    } else {
      issues.push({
        field: "mealsToPlan",
        rule: "enumArray",
        allowed: MEAL_SLOTS,
      });
    }
  }

  if (has("varietyGapDays")) {
    const value = body.varietyGapDays;
    if (isInteger(value) && value >= 0 && value <= 60) {
      update.variety_gap_days = value;
    } else {
      issues.push({ field: "varietyGapDays", rule: "range", min: 0, max: 60 });
    }
  }

  if (has("allowLeftovers")) {
    const value = body.allowLeftovers;
    if (typeof value === "boolean") {
      update.allow_leftovers = value;
    } else {
      issues.push({ field: "allowLeftovers", rule: "boolean" });
    }
  }

  if (has("budgetPreference")) {
    const value = body.budgetPreference;
    if (isEnumValue(value, BUDGET_PREFERENCES)) {
      update.budget_preference = value;
    } else {
      issues.push({
        field: "budgetPreference",
        rule: "enum",
        allowed: BUDGET_PREFERENCES,
      });
    }
  }

  if (issues.length > 0) {
    throw new ValidationError(
      "One or more preference fields are invalid.",
      issues,
    );
  }

  if (Object.keys(update).length === 0) {
    throw new ValidationError("At least one preference field is required.", [
      { field: "body", rule: "nonEmpty" },
    ]);
  }

  return update;
}
