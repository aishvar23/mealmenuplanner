/**
 * The onboarding wizard's ordered steps (design/06 § 2). `id` matches a
 * `current_step` value persisted on the draft, so resume can deep-link back to
 * the exact step the user left off on. The Review step carries no data of its
 * own — it confirms and completes.
 */

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
  title: string;
  /** Short subtitle shown under the step title. */
  subtitle: string;
  /** True for the fully-optional steps (the user can skip ahead). */
  optional: boolean;
}

export const STEPS: readonly StepMeta[] = [
  {
    id: "household_basics",
    title: "Your household",
    subtitle: "Who are we planning meals for?",
    optional: false,
  },
  {
    id: "food_preferences",
    title: "Food preferences",
    subtitle: "Diet, cuisines, and how spicy you like it.",
    optional: false,
  },
  {
    id: "meal_schedule",
    title: "Meal schedule",
    subtitle: "Which meals to plan and how long you cook.",
    optional: false,
  },
  {
    id: "allergies_health",
    title: "Allergies & health",
    subtitle: "Optional — anything to avoid or aim for.",
    optional: true,
  },
  {
    id: "budget",
    title: "Budget",
    subtitle: "Optional — your spending preference.",
    optional: true,
  },
  {
    id: "review",
    title: "Review",
    subtitle: "Check everything, then finish.",
    optional: false,
  },
];

/** Resolve a step's index by id; unknown / missing falls back to the first step. */
export function stepIndexById(id: string | null | undefined): number {
  const index = STEPS.findIndex((step) => step.id === id);
  return index >= 0 ? index : 0;
}
