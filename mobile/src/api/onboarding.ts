import type { DraftData } from "@/onboarding/draft";

import { apiRequest } from "./client";
import type { DraftStatus, OnboardingCompleteResult } from "./types";

/**
 * Onboarding draft endpoints (design/06 § 9, design/10 § 6). The wizard loads /
 * resumes a single `in_progress` draft, autosaves it with an idempotent `PUT`,
 * and promotes it into a live household with `POST .../complete`. The server
 * recomputes `completionPercentage` and re-stamps `lastSavedAt` on every save, so
 * those echo back authoritative.
 */

/** `GET`/`PUT /api/onboarding/draft` response (`DraftDto`). */
export interface OnboardingDraft {
  /** The draft's id — passed to `POST /complete`. */
  id: string;
  status: DraftStatus;
  /** A `current_step` value; deep-links the resume. */
  currentStep: string;
  completionPercentage: number;
  lastSavedAt: string;
  draftData: DraftData;
}

/** `PUT /api/onboarding/draft` request body. */
export interface SaveDraftInput {
  currentStep: string;
  /** Advisory — the server recomputes and stores its own value. */
  completionPercentage: number;
  draftData: DraftData;
}

/**
 * `GET /api/onboarding/draft` — load / resume detection. Returns the caller's
 * single `in_progress` draft, or `null` when none exists (start a fresh wizard).
 */
export function getDraft(): Promise<OnboardingDraft | null> {
  return apiRequest<OnboardingDraft | null>("/api/onboarding/draft");
}

/**
 * `PUT /api/onboarding/draft` — autosave. Idempotent upsert of the single
 * `in_progress` draft (created on first call); returns the saved draft.
 */
export function saveDraft(input: SaveDraftInput): Promise<OnboardingDraft> {
  return apiRequest<OnboardingDraft>("/api/onboarding/draft", {
    method: "PUT",
    body: input,
  });
}

/**
 * `POST /api/onboarding/complete` — promote the draft into a live household.
 * Atomic + idempotent server-side; returns the (created or reused) `householdId`.
 * Throws a `VALIDATION_ERROR` `ApiError` when required fields are missing/invalid.
 */
export function completeOnboarding(
  draftId: string,
): Promise<OnboardingCompleteResult> {
  return apiRequest<OnboardingCompleteResult>("/api/onboarding/complete", {
    method: "POST",
    body: { draftId },
  });
}
