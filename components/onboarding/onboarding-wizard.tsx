"use client";

import { ArrowLeft, ArrowRight } from "lucide-react";
import { useEffect, useState } from "react";

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
  nextStep,
  prevStep,
  stepMeta,
  type DraftData,
  type StepId,
} from "@/lib/onboarding";

/**
 * The onboarding wizard (P2-1): an ordered, navigable set of steps that collects
 * the household-setup `draftData` (design/06 § 2). State is held in memory here;
 * persistence wires in later — autosave + resume hydration in P2-2/P2-3/P2-4 via
 * the `initialStep`/`initialData` seams, and the completion transaction in P2-6
 * via `handleFinish`.
 *
 * Forward/back navigation is unrestricted (the design allows free movement
 * between steps); minimum-required-field gating is enforced separately in P2-5.
 */
export function OnboardingWizard({
  initialStep = FIRST_STEP,
  initialData = EMPTY_DRAFT_DATA,
}: {
  /** Step to open on — used to deep-link a resumed draft (P2-4). */
  initialStep?: StepId;
  /** Pre-filled draft payload — used to rehydrate a resumed draft (P2-4). */
  initialData?: DraftData;
}) {
  const [step, setStep] = useState<StepId>(initialStep);
  const [data, setData] = useState<DraftData>(initialData);
  const [finished, setFinished] = useState(false);

  const meta = stepMeta(step);

  // Bring the new step into view when navigating on small screens.
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [step]);

  function goTo(target: StepId) {
    setFinished(false);
    setStep(target);
  }

  /**
   * Merge a step's field patch into its draft slice. Generic over the section
   * key so each step stays strongly typed to its own fields.
   */
  function updateSection<K extends keyof DraftData>(
    key: K,
    patch: Partial<NonNullable<DraftData[K]>>,
  ) {
    setData((prev) => ({
      ...prev,
      [key]: { ...(prev[key] ?? {}), ...patch },
    }));
  }

  function handleFinish() {
    // P2-6 will POST /api/onboarding/complete here, then redirect to /today on
    // success. Until then, confirm the wizard reached a finishable state.
    setFinished(true);
  }

  return (
    <div className="space-y-6">
      <WizardProgress current={step} />

      <div>
        <h2 className="font-heading text-xl font-semibold tracking-tight">
          {meta.title}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">{meta.description}</p>
      </div>

      <div className="rounded-xl border bg-card p-5 text-card-foreground shadow-sm">
        {renderStep()}
      </div>

      {finished ? (
        <p
          role="status"
          className="rounded-md border border-primary/30 bg-primary/10 px-3 py-2 text-sm text-primary"
        >
          Your household setup is ready. Saving it and taking you to Today is
          wired up next (P2-6).
        </p>
      ) : null}

      <div className="flex items-center justify-between">
        <Button
          type="button"
          variant="outline"
          size="lg"
          onClick={() => goTo(prevStep(step))}
          disabled={isFirstStep(step)}
        >
          <ArrowLeft />
          Back
        </Button>

        {isLastStep(step) ? (
          <Button type="button" size="lg" onClick={handleFinish}>
            Finish setup
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
