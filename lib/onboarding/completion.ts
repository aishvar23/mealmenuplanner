/**
 * Onboarding completion model — which of the **minimum required fields** a draft
 * has, and the `completion_percentage` derived from them (design/06 § 2/§ 3).
 *
 * Pure and runtime-agnostic (no React, no Supabase, no `server-only`), so three
 * callers share one definition of "done": the draft API recomputes the
 * percentage server-side on every `PUT` (P2-2), the wizard shows the same bar and
 * gates "Finish" (P2-1/P2-5), and minimum-required validation reuses
 * {@link missingRequiredFields} (P2-5).
 *
 * The percentage is computed from the **required set only** — the six fields the
 * spec lets a user finish with (household name, family size, diet type, meals to
 * plan, weekday cooking time, cuisine preference). Optional steps (allergies,
 * budget) never move the bar, so reaching 100% lines up exactly with "completion
 * is allowed" (design/06 § 3). Each satisfied required field contributes a fixed
 * weight: `round(satisfied / 6 * 100)`.
 *
 * "Satisfied" here is presence-based (the field is meaningfully filled in), which
 * is the right semantic for a progress indicator. Strict leaf validation (valid
 * enum values, integer ranges) is the completion transaction's job (P2-6), not
 * the autosave bar's.
 */

import type { DraftData } from "./draft";

/**
 * The six minimum required fields (design/06 § 2). Order is presentation-stable
 * (wizard step order) but the percentage doesn't depend on it.
 */
export const REQUIRED_FIELD_IDS = [
  "name",
  "familySize",
  "dietType",
  "preferredCuisines",
  "mealsToPlan",
  "weekdayCookingTimeMinutes",
] as const;

export type RequiredFieldId = (typeof REQUIRED_FIELD_IDS)[number];

/** Total number of required fields — the denominator of the percentage. */
export const REQUIRED_FIELD_COUNT = REQUIRED_FIELD_IDS.length;

// Defensive leaf checks: `draftData` may arrive as untrusted JSON (the PUT body),
// so the static `DraftData` type is not a runtime guarantee.
function isNonEmptyString(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

function isPositiveNumber(value: unknown): boolean {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function isNonEmptyArray(value: unknown): boolean {
  return Array.isArray(value) && value.length > 0;
}

/**
 * One presence predicate per required field. Each reads the field from its step
 * slice exactly as design/06 § 2 maps it.
 */
const REQUIRED_FIELD_PREDICATES: Record<
  RequiredFieldId,
  (draft: DraftData) => boolean
> = {
  name: (draft) => isNonEmptyString(draft.householdBasics?.name),
  familySize: (draft) => isPositiveNumber(draft.householdBasics?.familySize),
  dietType: (draft) => isNonEmptyString(draft.foodPreferences?.dietType),
  preferredCuisines: (draft) =>
    isNonEmptyArray(draft.foodPreferences?.preferredCuisines),
  mealsToPlan: (draft) => isNonEmptyArray(draft.mealSchedule?.mealsToPlan),
  weekdayCookingTimeMinutes: (draft) =>
    isPositiveNumber(draft.mealSchedule?.weekdayCookingTimeMinutes),
};

/** True when the single required field `field` is meaningfully filled in. */
export function isRequiredFieldSatisfied(
  draft: DraftData,
  field: RequiredFieldId,
): boolean {
  return REQUIRED_FIELD_PREDICATES[field](draft);
}

/** The required fields that are filled in, in {@link REQUIRED_FIELD_IDS} order. */
export function satisfiedRequiredFields(draft: DraftData): RequiredFieldId[] {
  return REQUIRED_FIELD_IDS.filter((field) =>
    isRequiredFieldSatisfied(draft, field),
  );
}

/** The required fields still missing — what blocks completion (P2-5). */
export function missingRequiredFields(draft: DraftData): RequiredFieldId[] {
  return REQUIRED_FIELD_IDS.filter(
    (field) => !isRequiredFieldSatisfied(draft, field),
  );
}

/** True once every required field is present — the draft can be completed. */
export function isDraftComplete(draft: DraftData): boolean {
  return REQUIRED_FIELD_IDS.every((field) =>
    isRequiredFieldSatisfied(draft, field),
  );
}

/**
 * Completion percentage (0–100) from the required set only — the value the draft
 * API stores in `completion_percentage` (design/06 § 3). 100 exactly when
 * {@link isDraftComplete} is true.
 */
export function computeCompletionPercentage(draft: DraftData): number {
  const satisfied = satisfiedRequiredFields(draft).length;
  return Math.round((satisfied / REQUIRED_FIELD_COUNT) * 100);
}
