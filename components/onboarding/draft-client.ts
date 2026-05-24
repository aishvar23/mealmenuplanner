"use client";

/**
 * Browser-side fetch helpers for the onboarding draft endpoints (P2-2..P2-6).
 * Thin wrappers over `fetch` so the autosave hook and the resume flow share one
 * place that knows the URLs, the request shape, and how a `409` surfaces.
 *
 * The session travels in the HTTP-only auth cookies the proxy refreshes, so
 * these are plain same-origin requests — no Authorization header to manage.
 */

import type { DraftData, StepId } from "@/lib/onboarding";
import type { DraftDto } from "@/lib/services/onboarding/dto";

const DRAFT_URL = "/api/onboarding/draft";
const COMPLETE_URL = "/api/onboarding/complete";

/** The autosave payload: the current step plus the merged draft (design/06 § 5). */
export interface DraftSnapshot {
  currentStep: StepId;
  draftData: DraftData;
}

/** Distinguishes the lost-the-in-progress-race case from a saved draft. */
export type PutDraftResult =
  | { kind: "saved"; draft: DraftDto }
  | { kind: "conflict" };

/** `GET /api/onboarding/draft` — the caller's in-progress draft, or `null`. */
export async function fetchDraft(): Promise<DraftDto | null> {
  const res = await fetch(DRAFT_URL, {
    method: "GET",
    headers: { accept: "application/json" },
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`Failed to load draft (${res.status})`);
  }
  return (await res.json()) as DraftDto | null;
}

/**
 * `PUT /api/onboarding/draft` — idempotent autosave. Returns the saved draft, or
 * a `conflict` marker on `409` (a concurrent device won the in-progress slot —
 * the caller re-`GET`s to reconcile before retrying, design/06 § 5). Any other
 * non-2xx throws.
 */
export async function putDraft(
  snapshot: DraftSnapshot,
): Promise<PutDraftResult> {
  const res = await fetch(DRAFT_URL, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      currentStep: snapshot.currentStep,
      draftData: snapshot.draftData,
    }),
  });

  if (res.status === 409) return { kind: "conflict" };
  if (!res.ok) throw new Error(`Failed to save draft (${res.status})`);

  return { kind: "saved", draft: (await res.json()) as DraftDto };
}

/**
 * `POST /api/onboarding/complete` — promote the draft into a live household.
 * Returns the new `householdId` on `201`; throws on any non-2xx (the caller
 * surfaces a retry affordance).
 */
export async function completeDraft(
  draftId: string,
): Promise<{ householdId: string }> {
  const res = await fetch(COMPLETE_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ draftId }),
  });
  if (!res.ok) throw new Error(`Failed to complete onboarding (${res.status})`);
  return (await res.json()) as { householdId: string };
}
