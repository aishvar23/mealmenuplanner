"use client";

import { ArrowLeft, ArrowRight } from "lucide-react";
import { useEffect, useState } from "react";

import { SaveIndicator } from "@/components/onboarding/save-indicator";
import { AllergiesHealthStep } from "@/components/onboarding/steps/allergies-health-step";
import { BudgetStep } from "@/components/onboarding/steps/budget-step";
import { FoodPreferencesStep } from "@/components/onboarding/steps/food-preferences-step";
import { HouseholdBasicsStep } from "@/components/onboarding/steps/household-basics-step";
import { MealScheduleStep } from "@/components/onboarding/steps/meal-schedule-step";
import { PreferredDishesStep } from "@/components/onboarding/steps/preferred-dishes-step";
import { ReviewStep } from "@/components/onboarding/steps/review-step";
import { WizardProgress } from "@/components/onboarding/wizard-progress";
import { Button } from "@/components/ui/button";
import {
  draftDataToLikedDishes,
  draftDataToPreferencesPatch,
  EDIT_STEP_IDS,
  EMPTY_DRAFT_DATA,
  FIRST_STEP,
  isFirstStepOf,
  isLastStepOf,
  missingRequiredFields,
  nextStepOf,
  prevStepOf,
  STEP_IDS,
  stepMeta,
  type DraftData,
  type RequiredFieldId,
  type StepId,
} from "@/lib/onboarding";

import {
  completeDraft,
  saveFoodPreferences,
  savePreferences,
} from "./draft-client";
import { useDraftAutosave } from "./use-draft-autosave";

/**
 * The onboarding wizard (P2-1 UI; P2-3 autosave; P2-5 gating; P2-6 completion).
 *
 * Holds the `draftData` + `currentStep` in memory and persists them through
 * {@link useDraftAutosave}: edits debounce-save, Next/Back save immediately, and
 * the save-state indicator reflects progress (design/06 § 5). Finishing is gated
 * on the minimum required set (design/06 § 2) and promotes the draft via
 * `POST /api/onboarding/complete`, then redirects to Today (Flow 1).
 *
 * The same wizard serves **edit mode**: re-run on an existing household, it seeds
 * from the live preferences, walks the {@link EDIT_STEP_IDS} subset, skips draft
 * autosave entirely, and "Save changes" issues a `PATCH .../preferences` instead
 * of completing a draft.
 */

export type WizardMode = "create" | "edit";

/** Friendly label + the step that owns each required field (for the gate notice). */
const REQUIRED_FIELD_META: Record<
  RequiredFieldId,
  { label: string; step: StepId }
> = {
  name: { label: "Household name", step: "household_basics" },
  familySize: { label: "Family size", step: "household_basics" },
  dietType: { label: "Diet type", step: "food_preferences" },
  preferredCuisines: {
    label: "At least one cuisine",
    step: "food_preferences",
  },
  mealsToPlan: { label: "Meals to plan", step: "meal_schedule" },
  weekdayCookingTimeMinutes: {
    label: "Weekday cooking time",
    step: "meal_schedule",
  },
};

/** Field-level message shown next to a required input when advancing is blocked. */
const REQUIRED_FIELD_MESSAGES: Record<RequiredFieldId, string> = {
  name: "Enter a household name.",
  familySize: "Enter your family size.",
  dietType: "Choose a diet type.",
  preferredCuisines: "Pick at least one cuisine.",
  mealsToPlan: "Pick at least one meal to plan.",
  weekdayCookingTimeMinutes: "Set your weekday cooking time.",
};

const RELATIVE_TICK_MS = 30_000;

export function OnboardingWizard({
  initialStep = FIRST_STEP,
  initialData = EMPTY_DRAFT_DATA,
  initialDraftId = null,
  initialLastSavedAt = null,
  mode = "create",
  householdId = null,
}: {
  initialStep?: StepId;
  initialData?: DraftData;
  /** Draft id to resume into; `null` until the first autosave creates one. */
  initialDraftId?: string | null;
  initialLastSavedAt?: string | null;
  /** `create` (default) sets up a new household; `edit` updates an existing one. */
  mode?: WizardMode;
  /** Required in `edit` mode — the household whose preferences are being saved. */
  householdId?: string | null;
}) {
  const editing = mode === "edit";
  const steps: readonly StepId[] = editing ? EDIT_STEP_IDS : STEP_IDS;

  const [step, setStep] = useState<StepId>(initialStep);
  const [data, setData] = useState<DraftData>(initialData);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  // True once the user has tried to advance past a step with missing required
  // fields — flips the field-level errors on for the current step (P2-5, BUG-004).
  const [showErrors, setShowErrors] = useState(false);
  // Re-render periodically so the relative "Last saved …" string stays current.
  const [, setTick] = useState(0);

  const { status, lastSavedAt, draftId, queueSave, saveNow, retry } =
    useDraftAutosave({ initialDraftId, initialLastSavedAt });

  const meta = stepMeta(step);
  const missing = missingRequiredFields(data);
  const isComplete = missing.length === 0;

  // Bring the new step into view when navigating on small screens.
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [step]);

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), RELATIVE_TICK_MS);
    return () => clearInterval(id);
  }, []);

  function goTo(target: StepId) {
    setStep(target);
    // Leaving the step clears its just-shown validation errors; the next step
    // re-validates on its own Next press.
    setShowErrors(false);
    // Per-step autosave (design/06 § 5): persist with the step we moved to. Edit
    // mode has no draft — the wizard is seeded from live preferences and saves
    // only on "Save changes" — so navigation never touches the draft API.
    if (!editing) {
      void saveNow({ currentStep: target, draftData: data });
    }
  }

  // The current step's still-missing required fields. The household name isn't
  // editable in edit mode, so it never blocks navigation there.
  const currentStepMissing = missing.filter(
    (field) =>
      REQUIRED_FIELD_META[field].step === step &&
      !(editing && field === "name"),
  );

  /** Advance to the next step, but block (and reveal errors) if this step is incomplete. */
  function handleNext() {
    if (currentStepMissing.length > 0) {
      setShowErrors(true);
      return;
    }
    goTo(nextStepOf(steps, step));
  }

  /** The message to show under `field` right now, or undefined to stay quiet. */
  function errorFor(field: RequiredFieldId): string | undefined {
    return showErrors && missing.includes(field)
      ? REQUIRED_FIELD_MESSAGES[field]
      : undefined;
  }

  /** Merge a step's field patch into its slice and (create mode) debounce-save. */
  function updateSection<K extends keyof DraftData>(
    key: K,
    patch: Partial<NonNullable<DraftData[K]>>,
  ) {
    const next: DraftData = {
      ...data,
      [key]: { ...(data[key] ?? {}), ...patch },
    };
    setData(next);
    if (!editing) {
      queueSave({ currentStep: step, draftData: next });
    }
  }

  async function handleSubmit() {
    if (!isComplete || submitting) return;
    setSubmitting(true);
    setSubmitError(null);

    if (editing) {
      if (!householdId) {
        setSubmitError("We couldn't find your household. Please reload.");
        setSubmitting(false);
        return;
      }
      try {
        // Household-scoped preferences and the member's own preferred dishes
        // live in different tables behind different endpoints (BUG-006); save
        // both before navigating.
        await Promise.all([
          savePreferences(householdId, draftDataToPreferencesPatch(data)),
          saveFoodPreferences(householdId, draftDataToLikedDishes(data)),
        ]);
        // Full navigation back to the household so the updated preferences are
        // re-read server-side.
        window.location.assign("/household");
      } catch {
        setSubmitError("We couldn't save your changes. Please try again.");
        setSubmitting(false);
      }
      return;
    }

    try {
      // Flush the latest edits first so completion validates the saved draft.
      const saved = await saveNow({ currentStep: "review", draftData: data });
      const id = saved?.id ?? draftId;
      if (!id) {
        setSubmitError(
          "We couldn't save your setup. Check your connection and try again.",
        );
        setSubmitting(false);
        return;
      }
      await completeDraft(id);
      // Success: hand off to Today (full navigation so the new session/household
      // is picked up server-side). Flow 1 continues with first-meal generation.
      window.location.assign("/today");
    } catch {
      setSubmitError(
        "We couldn't finish setting up your household. Please try again.",
      );
      setSubmitting(false);
    }
  }

  const onLastStep = isLastStepOf(steps, step);

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-lg border bg-card p-4 shadow-xs">
        <WizardProgress current={step} steps={steps} />
      </div>

      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="font-heading text-2xl font-bold tracking-tight">
            {meta.title}
          </h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            {meta.description}
          </p>
        </div>
        {editing ? null : (
          <div className="shrink-0 pt-1">
            <SaveIndicator
              status={status}
              lastSavedAt={lastSavedAt}
              onRetry={retry}
            />
          </div>
        )}
      </div>

      <div className="rounded-lg border bg-card p-5 text-card-foreground shadow-xs sm:p-6">
        {renderStep()}
      </div>

      {onLastStep && !isComplete ? (
        <div
          role="status"
          className="rounded-lg border border-saffron/40 bg-saffron/15 px-3 py-2 text-sm"
        >
          <p className="font-medium">
            A few required details are still missing:
          </p>
          <ul className="mt-1 space-y-0.5">
            {missing.map((field) => (
              <li key={field}>
                <button
                  type="button"
                  onClick={() => goTo(REQUIRED_FIELD_META[field].step)}
                  className="text-left underline-offset-2 hover:underline"
                >
                  {REQUIRED_FIELD_META[field].label}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {submitError ? (
        <p
          role="alert"
          className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {submitError}
        </p>
      ) : null}

      <div className="flex items-center justify-between gap-3">
        <Button
          type="button"
          variant="outline"
          size="lg"
          onClick={() => goTo(prevStepOf(steps, step))}
          disabled={isFirstStepOf(steps, step) || submitting}
        >
          <ArrowLeft />
          Back
        </Button>

        {onLastStep ? (
          <Button
            type="button"
            size="lg"
            onClick={handleSubmit}
            disabled={!isComplete || submitting}
          >
            {editing
              ? submitting
                ? "Saving…"
                : "Save changes"
              : submitting
                ? "Finishing…"
                : "Finish setup"}
          </Button>
        ) : (
          <div className="flex items-center gap-2">
            {meta.optional ? (
              <Button
                type="button"
                variant="ghost"
                size="lg"
                onClick={() => goTo(nextStepOf(steps, step))}
              >
                Skip for now
              </Button>
            ) : null}
            <Button type="button" size="lg" onClick={handleNext}>
              Next
              <ArrowRight />
            </Button>
          </div>
        )}
      </div>
    </div>
  );

  function renderStep() {
    switch (step) {
      case "household_basics":
        return (
          <HouseholdBasicsStep
            value={data.householdBasics ?? {}}
            onChange={(patch) => updateSection("householdBasics", patch)}
            mode={mode}
            errors={{
              name: errorFor("name"),
              familySize: errorFor("familySize"),
            }}
          />
        );
      case "food_preferences":
        return (
          <FoodPreferencesStep
            value={data.foodPreferences ?? {}}
            onChange={(patch) => updateSection("foodPreferences", patch)}
            errors={{
              dietType: errorFor("dietType"),
              preferredCuisines: errorFor("preferredCuisines"),
            }}
          />
        );
      case "preferred_dishes":
        return (
          <PreferredDishesStep
            value={data.preferredDishes ?? {}}
            onChange={(patch) => updateSection("preferredDishes", patch)}
            diet={data.foodPreferences?.dietType}
          />
        );
      case "meal_schedule":
        return (
          <MealScheduleStep
            value={data.mealSchedule ?? {}}
            onChange={(patch) => updateSection("mealSchedule", patch)}
            errors={{
              mealsToPlan: errorFor("mealsToPlan"),
              weekdayCookingTimeMinutes: errorFor("weekdayCookingTimeMinutes"),
            }}
          />
        );
      case "allergies_health":
        return (
          <AllergiesHealthStep
            value={data.allergiesHealth ?? {}}
            onChange={(patch) => updateSection("allergiesHealth", patch)}
          />
        );
      case "budget":
        return (
          <BudgetStep
            value={data.budget ?? {}}
            onChange={(patch) => updateSection("budget", patch)}
          />
        );
      case "review":
        return <ReviewStep data={data} onEditStep={goTo} mode={mode} />;
    }
  }
}
