"use client";

import { ArrowLeft, ArrowRight } from "lucide-react";
import { useEffect, useState } from "react";

import { SaveIndicator } from "@/components/onboarding/save-indicator";
import { AllergiesHealthStep } from "@/components/onboarding/steps/allergies-health-step";
import { BudgetStep } from "@/components/onboarding/steps/budget-step";
import { FoodPreferencesStep } from "@/components/onboarding/steps/food-preferences-step";
import { HouseholdBasicsStep } from "@/components/onboarding/steps/household-basics-step";
import { MealScheduleStep } from "@/components/onboarding/steps/meal-schedule-step";
import { ReviewStep } from "@/components/onboarding/steps/review-step";
import { WizardProgress } from "@/components/onboarding/wizard-progress";
import { Button } from "@/components/ui/button";
import {
  EMPTY_DRAFT_DATA,
  FIRST_STEP,
  isFirstStep,
  isLastStep,
  missingRequiredFields,
  nextStep,
  prevStep,
  stepMeta,
  type DraftData,
  type RequiredFieldId,
  type StepId,
} from "@/lib/onboarding";

import { completeDraft } from "./draft-client";
import { useDraftAutosave } from "./use-draft-autosave";

/**
 * The onboarding wizard (P2-1 UI; P2-3 autosave; P2-5 gating; P2-6 completion).
 *
 * Holds the `draftData` + `currentStep` in memory and persists them through
 * {@link useDraftAutosave}: edits debounce-save, Next/Back save immediately, and
 * the save-state indicator reflects progress (design/06 § 5). Finishing is gated
 * on the minimum required set (design/06 § 2) and promotes the draft via
 * `POST /api/onboarding/complete`, then redirects to Today (Flow 1).
 */

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

const RELATIVE_TICK_MS = 30_000;

export function OnboardingWizard({
  initialStep = FIRST_STEP,
  initialData = EMPTY_DRAFT_DATA,
  initialDraftId = null,
  initialLastSavedAt = null,
}: {
  initialStep?: StepId;
  initialData?: DraftData;
  /** Draft id to resume into; `null` until the first autosave creates one. */
  initialDraftId?: string | null;
  initialLastSavedAt?: string | null;
}) {
  const [step, setStep] = useState<StepId>(initialStep);
  const [data, setData] = useState<DraftData>(initialData);
  const [submitting, setSubmitting] = useState(false);
  const [completionError, setCompletionError] = useState<string | null>(null);
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
    // Per-step autosave (design/06 § 5): persist with the step we moved to.
    void saveNow({ currentStep: target, draftData: data });
  }

  /** Merge a step's field patch into its slice and debounce-save. */
  function updateSection<K extends keyof DraftData>(
    key: K,
    patch: Partial<NonNullable<DraftData[K]>>,
  ) {
    const next: DraftData = {
      ...data,
      [key]: { ...(data[key] ?? {}), ...patch },
    };
    setData(next);
    queueSave({ currentStep: step, draftData: next });
  }

  async function handleFinish() {
    if (!isComplete || submitting) return;
    setSubmitting(true);
    setCompletionError(null);
    try {
      // Flush the latest edits first so completion validates the saved draft.
      const saved = await saveNow({ currentStep: "review", draftData: data });
      const id = saved?.id ?? draftId;
      if (!id) {
        setCompletionError(
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
      setCompletionError(
        "We couldn't finish setting up your household. Please try again.",
      );
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <WizardProgress current={step} />

      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="font-heading text-xl font-semibold tracking-tight">
            {meta.title}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {meta.description}
          </p>
        </div>
        <div className="shrink-0 pt-1">
          <SaveIndicator
            status={status}
            lastSavedAt={lastSavedAt}
            onRetry={retry}
          />
        </div>
      </div>

      <div className="rounded-xl border bg-card p-5 text-card-foreground shadow-sm">
        {renderStep()}
      </div>

      {isLastStep(step) && !isComplete ? (
        <div
          role="status"
          className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm"
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

      {completionError ? (
        <p
          role="alert"
          className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {completionError}
        </p>
      ) : null}

      <div className="flex items-center justify-between">
        <Button
          type="button"
          variant="outline"
          size="lg"
          onClick={() => goTo(prevStep(step))}
          disabled={isFirstStep(step) || submitting}
        >
          <ArrowLeft />
          Back
        </Button>

        {isLastStep(step) ? (
          <Button
            type="button"
            size="lg"
            onClick={handleFinish}
            disabled={!isComplete || submitting}
          >
            {submitting ? "Finishing…" : "Finish setup"}
          </Button>
        ) : (
          <Button type="button" size="lg" onClick={() => goTo(nextStep(step))}>
            Next
            <ArrowRight />
          </Button>
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
          />
        );
      case "food_preferences":
        return (
          <FoodPreferencesStep
            value={data.foodPreferences ?? {}}
            onChange={(patch) => updateSection("foodPreferences", patch)}
          />
        );
      case "meal_schedule":
        return (
          <MealScheduleStep
            value={data.mealSchedule ?? {}}
            onChange={(patch) => updateSection("mealSchedule", patch)}
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
        return <ReviewStep data={data} onEditStep={goTo} />;
    }
  }
}
