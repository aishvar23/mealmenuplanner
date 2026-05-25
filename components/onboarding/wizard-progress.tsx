"use client";

import { Check } from "lucide-react";

import { STEP_IDS, stepMeta, type StepId } from "@/lib/onboarding";
import { cn } from "@/lib/utils";

/**
 * Wizard position indicator: a "Step N of M" count, a progress bar, and the
 * ordered step labels with the current/completed state marked. Purely a view of
 * the current {@link StepId} — navigation is driven by the wizard's Back/Next
 * controls (P2-1), so the labels are not interactive here.
 *
 * `steps` is the active step list: the full create flow ({@link STEP_IDS}, the
 * default) or edit mode's subset, so the count and labels track whichever flow
 * is running.
 */
export function WizardProgress({
  current,
  steps = STEP_IDS,
}: {
  current: StepId;
  steps?: readonly StepId[];
}) {
  const currentIndex = steps.indexOf(current);
  const total = steps.length;
  const percent = Math.round(((currentIndex + 1) / total) * 100);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium">
          Step {currentIndex + 1} of {total}
        </span>
        <span className="text-muted-foreground">{stepMeta(current).label}</span>
      </div>

      <div
        className="h-2 w-full overflow-hidden rounded-full bg-muted"
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

      <ol className="hidden flex-wrap gap-2 text-xs sm:flex">
        {steps.map((id, index) => {
          const done = index < currentIndex;
          const active = index === currentIndex;
          return (
            <li
              key={id}
              aria-current={active ? "step" : undefined}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5",
                active &&
                  "border-primary/30 bg-primary/10 font-bold text-primary",
                done && "border-border bg-background text-muted-foreground",
                !active &&
                  !done &&
                  "border-transparent text-muted-foreground/60",
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
              {stepMeta(id).label}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
