/**
 * Onboarding wizard step model — the ordered steps and forward/back navigation
 * (design/06 § 2). Pure and runtime-agnostic (no React, no Supabase, no
 * `server-only`), so the client wizard and the later draft API (P2-2) share one
 * definition of what the steps are, in what order, and which `current_step`
 * value each maps to.
 *
 * Step ids are the exact `household_profile_drafts.current_step` values from
 * design/06 § 2, so a saved draft can be deep-linked back to its step verbatim.
 */

/** The ordered `current_step` values (design/06 § 2). */
export const STEP_IDS = [
  "household_basics",
  "food_preferences",
  "meal_schedule",
  "allergies_health",
  "budget",
  "review",
] as const;

export type StepId = (typeof STEP_IDS)[number];

export interface StepMeta {
  id: StepId;
  /** Short label for the progress indicator. */
  label: string;
  /** Heading shown at the top of the step panel. */
  title: string;
  /** One-line guidance under the heading. */
  description: string;
  /**
   * Steps 4–5 (`allergies_health`, `budget`) are fully optional — Review can be
   * reached and completion invoked with them empty (design/06 § 2). Used only to
   * label the step; completion gating lives in P2-5.
   */
  optional: boolean;
}

/** Step metadata in wizard order; index aligns with {@link STEP_IDS}. */
export const ONBOARDING_STEPS: readonly StepMeta[] = [
  {
    id: "household_basics",
    label: "Household",
    title: "Tell us about your household",
    description: "The basics we need to size and shape suggestions.",
    optional: false,
  },
  {
    id: "food_preferences",
    label: "Food",
    title: "Your food preferences",
    description: "Diet, cuisines, and how spicy you like things.",
    optional: false,
  },
  {
    id: "meal_schedule",
    label: "Schedule",
    title: "Meals and cooking time",
    description: "Which meals to plan and how long you have to cook.",
    optional: false,
  },
  {
    id: "allergies_health",
    label: "Allergies",
    title: "Allergies and health (optional)",
    description: "Anything to avoid, and dietary goals to keep in mind.",
    optional: true,
  },
  {
    id: "budget",
    label: "Budget",
    title: "Budget (optional)",
    description: "Roughly how you'd like to balance cost.",
    optional: true,
  },
  {
    id: "review",
    label: "Review",
    title: "Review and finish",
    description: "Check everything before we set up your household.",
    optional: false,
  },
];

/** Total number of steps. */
export const TOTAL_STEPS = STEP_IDS.length;

/** The step a fresh wizard opens on. */
export const FIRST_STEP: StepId = STEP_IDS[0];

/** The terminal Review step. */
export const LAST_STEP: StepId = STEP_IDS[STEP_IDS.length - 1] ?? FIRST_STEP;

/** Zero-based position of `step` in wizard order. */
export function stepIndex(step: StepId): number {
  return STEP_IDS.indexOf(step);
}

/** The metadata for `step` (always present — `StepId` is exhaustive). */
export function stepMeta(step: StepId): StepMeta {
  const meta = ONBOARDING_STEPS.find((candidate) => candidate.id === step);
  if (!meta) {
    throw new Error(`No metadata for onboarding step "${step}"`);
  }
  return meta;
}

/**
 * Narrow an arbitrary string (e.g. a `current_step` loaded from a draft) to a
 * known {@link StepId}, so a stale or malformed value can be detected before it
 * is used to deep-link the wizard.
 */
export function isValidStep(value: string): value is StepId {
  return (STEP_IDS as readonly string[]).includes(value);
}

/** True when `step` is the first step (Back should be disabled). */
export function isFirstStep(step: StepId): boolean {
  return stepIndex(step) === 0;
}

/** True when `step` is the last step (Next becomes Finish). */
export function isLastStep(step: StepId): boolean {
  return stepIndex(step) === TOTAL_STEPS - 1;
}

/** The next step, or the same step when already on the last one (clamped). */
export function nextStep(step: StepId): StepId {
  return STEP_IDS[stepIndex(step) + 1] ?? step;
}

/** The previous step, or the same step when already on the first one (clamped). */
export function prevStep(step: StepId): StepId {
  return STEP_IDS[stepIndex(step) - 1] ?? step;
}
