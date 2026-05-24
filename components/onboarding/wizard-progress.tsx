"use client";

import { Check } from "lucide-react";

import {
  ONBOARDING_STEPS,
  stepIndex,
  stepMeta,
  type StepId,
} from "@/lib/onboarding";
import { cn } from "@/lib/utils";

/**
 * Wizard position indicator: a "Step N of M" count, a progress bar, and the
 * ordered step labels with the current/completed state marked. Purely a view of
 * the current {@link StepId} — navigation is driven by the wizard's Back/Next
 * controls (P2-1), so the labels are not interactive here.
 */
export function WizardProgress({ current }: { current: StepId }) {
  const currentIndex = stepIndex(current);
  const total = ONBOARDING_STEPS.length;
  const percent = Math.round(((currentIndex + 1) / total) * 100);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium">
          Step {currentIndex + 1} of {total}
        </span>
        <span className="text-muted-foreground">{stepMeta(current).label}</span>
      </div>

      <div
        className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Onboarding progress"
      >
        <div
          className="h-full rounded-full bg-primary transition-all"
          style={{ width: `${percent}%` }}
        />
      </div>

      <ol className="hidden flex-wrap gap-x-4 gap-y-1 text-xs sm:flex">
        {ONBOARDING_STEPS.map((step, index) => {
          const done = index < currentIndex;
          const active = index === currentIndex;
          return (
            <li
              key={step.id}
              aria-current={active ? "step" : undefined}
              className={cn(
                "inline-flex items-center gap-1",
                active && "font-medium text-foreground",
                done && "text-muted-foreground",
                !active && !done && "text-muted-foreground/60",
              )}
            >
              {done ? (
                <Check className="size-3.5 text-primary" />
              ) : (
                <span
                  className={cn(
                    "inline-flex size-4 items-center justify-center rounded-full text-[10px]",
                    active
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground",
                  )}
                >
                  {index + 1}
                </span>
              )}
              {step.label}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
