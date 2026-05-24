"use client";

import { useState } from "react";

import { OnboardingWizard } from "@/components/onboarding/onboarding-wizard";
import { ResumePrompt } from "@/components/onboarding/resume-prompt";
import {
  EMPTY_DRAFT_DATA,
  FIRST_STEP,
  isValidStep,
  type DraftData,
  type StepId,
} from "@/lib/onboarding";
import type { DraftDto } from "@/lib/services/onboarding/dto";

import { putDraft } from "./draft-client";

/**
 * Onboarding entry point (P2-4) — decides between the resume prompt and the
 * wizard from the draft loaded server-side (design/06 § 6).
 *
 * - **No in-progress draft** → start a fresh wizard at step 1; the first
 *   autosave creates the draft row.
 * - **An in-progress draft exists** → show the resume prompt first. Resume
 *   hydrates the wizard from `draftData` and deep-links to `currentStep`; Start
 *   over resets that single draft to empty (one `PUT`, keeping the
 *   one-in-progress-per-user invariant) and opens a fresh wizard.
 */

interface WizardSeed {
  step: StepId;
  data: DraftData;
  draftId: string | null;
  lastSavedAt: string | null;
}

function seedFromDraft(draft: DraftDto): WizardSeed {
  return {
    step: isValidStep(draft.currentStep) ? draft.currentStep : FIRST_STEP,
    data: draft.draftData ?? EMPTY_DRAFT_DATA,
    draftId: draft.id,
    lastSavedAt: draft.lastSavedAt,
  };
}

const FRESH_SEED: WizardSeed = {
  step: FIRST_STEP,
  data: EMPTY_DRAFT_DATA,
  draftId: null,
  lastSavedAt: null,
};

export function OnboardingExperience({
  initialDraft,
}: {
  initialDraft: DraftDto | null;
}) {
  // Only an in-progress draft is resumable; anything else starts fresh.
  const resumable =
    initialDraft && initialDraft.status === "in_progress" ? initialDraft : null;

  const [showPrompt, setShowPrompt] = useState(resumable !== null);
  const [seed, setSeed] = useState<WizardSeed>(
    resumable ? seedFromDraft(resumable) : FRESH_SEED,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleResume() {
    if (resumable) setSeed(seedFromDraft(resumable));
    setShowPrompt(false);
  }

  async function handleStartOver() {
    setBusy(true);
    setError(null);
    try {
      // Reset the single in-progress draft to empty (design/06 § 6). The PUT
      // upserts the caller's one in-progress row, so this clears it in place.
      const result = await putDraft({
        currentStep: FIRST_STEP,
        draftData: EMPTY_DRAFT_DATA,
      });
      const draftId = result.kind === "saved" ? result.draft.id : null;
      const lastSavedAt =
        result.kind === "saved" ? result.draft.lastSavedAt : null;
      setSeed({ ...FRESH_SEED, draftId, lastSavedAt });
      setShowPrompt(false);
    } catch {
      setError("Couldn't start over. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  if (showPrompt && resumable) {
    return (
      <ResumePrompt
        completionPercentage={resumable.completionPercentage}
        lastSavedAt={resumable.lastSavedAt}
        onResume={handleResume}
        onStartOver={handleStartOver}
        busy={busy}
        error={error}
      />
    );
  }

  return (
    <OnboardingWizard
      key={seed.draftId ?? "fresh"}
      initialStep={seed.step}
      initialData={seed.data}
      initialDraftId={seed.draftId}
      initialLastSavedAt={seed.lastSavedAt}
    />
  );
}
