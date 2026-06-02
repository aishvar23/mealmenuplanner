import type { DraftData } from "./draft";

/**
 * Onboarding completion model — which of the **minimum required fields** a draft
 * has, and the `completion_percentage` derived from them (design/06 § 2/§ 3).
 * Hand-authored mirror of the web's `lib/onboarding/completion.ts`; the server
 * recomputes the same percentage on every save, so the bar the wizard shows
 * always matches what the backend stores.
 *
 * The six required fields the spec lets a user finish with: household name, family
 * size, diet type, cuisine preference, meals to plan, weekday cooking time.
 * Optional steps (allergies, budget) never move the bar.
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

export const REQUIRED_FIELD_COUNT = REQUIRED_FIELD_IDS.length;

// Defensive leaf checks: `draftData` may arrive as untrusted JSON, so the static
// `DraftData` type is not a runtime guarantee.
function isNonEmptyString(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

function isPositiveNumber(value: unknown): boolean {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function isNonEmptyArray(value: unknown): boolean {
  return Array.isArray(value) && value.length > 0;
}

const REQUIRED_FIELD_PREDICATES: Record<
  RequiredFieldId,
  (draft: DraftData) => boolean
> = {
  name: (draft) => isNonEmptyString(draft.householdBasics?.name),
  familySize: (draft) => isPositiveNumber(draft.householdBasics?.familySize),
  dietType: (draft) => isNonEmptyArray(draft.foodPreferences?.dietTypes),
  preferredCuisines: (draft) =>
    isNonEmptyArray(draft.foodPreferences?.preferredCuisines),
  mealsToPlan: (draft) => isNonEmptyArray(draft.mealSchedule?.mealsToPlan),
  weekdayCookingTimeMinutes: (draft) =>
    isPositiveNumber(draft.mealSchedule?.weekdayCookingTimeMinutes),
};

/** True when the single required field is meaningfully filled in. */
export function isRequiredFieldSatisfied(
  draft: DraftData,
  field: RequiredFieldId,
): boolean {
  return REQUIRED_FIELD_PREDICATES[field](draft);
}

/** The required fields still missing — what blocks completion. */
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

/** Completion percentage (0–100) from the required set only; 100 ⇔ complete. */
export function computeCompletionPercentage(draft: DraftData): number {
  const satisfied = REQUIRED_FIELD_IDS.filter((field) =>
    isRequiredFieldSatisfied(draft, field),
  ).length;
  return Math.round((satisfied / REQUIRED_FIELD_COUNT) * 100);
}
