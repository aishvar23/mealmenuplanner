"use client";

import { Button } from "@/components/ui/button";
import { formatRelativeLastSaved } from "@/lib/onboarding";

/**
 * Resume prompt (P2-4) — design/06 § 6, Flow 2 steps 6–7.
 *
 * Shown when the user re-enters onboarding with an existing `in_progress` draft,
 * instead of jumping straight back in. Surfaces how far along they are and when
 * it was last saved (both from the loaded draft), then offers Resume (hydrate +
 * deep-link to `currentStep`) or Start over (abandon progress, fresh wizard).
 */
export function ResumePrompt({
  completionPercentage,
  lastSavedAt,
  onResume,
  onStartOver,
  busy = false,
  error = null,
}: {
  completionPercentage: number;
  lastSavedAt: string | null;
  onResume: () => void;
  onStartOver: () => void;
  /** True while Start over is resetting the server draft. */
  busy?: boolean;
  error?: string | null;
}) {
  const relative = formatRelativeLastSaved(lastSavedAt);

  return (
    <div className="rounded-xl border bg-card p-6 text-card-foreground shadow-sm">
      <h2 className="font-heading text-xl font-semibold tracking-tight">
        Continue setting up your household profile?
      </h2>
      <p className="mt-2 text-muted-foreground">
        You&apos;re{" "}
        <strong className="text-foreground">
          {completionPercentage}% done
        </strong>
        .
        {relative ? (
          <>
            {" "}
            <strong className="text-foreground">{relative}</strong>.
          </>
        ) : null}
      </p>

      {error ? (
        <p
          role="alert"
          className="mt-4 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {error}
        </p>
      ) : null}

      <div className="mt-6 flex flex-col gap-3 sm:flex-row">
        <Button type="button" size="lg" onClick={onResume} disabled={busy}>
          Resume
        </Button>
        <Button
          type="button"
          variant="outline"
          size="lg"
          onClick={onStartOver}
          disabled={busy}
        >
          {busy ? "Starting over…" : "Start over"}
        </Button>
      </div>
    </div>
  );
}
