import "server-only";

import { requireAuthUser } from "@/lib/auth";
import type { Json } from "@/lib/db/database.types";
import { createServerSupabaseClient } from "@/lib/db/server";
import { ConflictError, InternalError } from "@/lib/errors";
import type { JsonObject } from "@/lib/http";
import { computeCompletionPercentage } from "@/lib/onboarding";

import { toDraftDto, type DraftDto } from "./dto";
import { parseDraftUpdate } from "./validate-draft";

/**
 * `onboarding` service — autosave (P2-2).
 *
 * Backs `PUT /api/onboarding/draft` (design/06 § 5/§ 9): an idempotent upsert of
 * the caller's single `in_progress` draft, creating it on the first call. The
 * server **recomputes** `completion_percentage` from the minimum required set and
 * re-stamps `last_saved_at` regardless of client input (the client's percentage
 * is advisory only).
 *
 * Upsert without an `ON CONFLICT` clause on the *partial* unique index: try to
 * update the existing `in_progress` row, and if none matched, insert one. RLS
 * (`hpd_all`, self-only) and the explicit `user_id` filter scope every write to
 * the caller. The `uq_one_active_draft_per_user` partial unique index is the
 * race guard — if a concurrent device created the draft between our update and
 * insert, the insert hits a unique violation, which we surface as `409` so the
 * client re-`GET`s to reconcile and re-saves (design/06 § 5).
 */

// Single string literal so supabase-js can statically infer the returned row;
// matches the DTO projection so PUT and GET return an identical draft object.
const DRAFT_SELECT =
  "id, status, current_step, completion_percentage, last_saved_at, draft_data";

/** Postgres `unique_violation` — the `in_progress` slot was taken concurrently. */
const UNIQUE_VIOLATION = "23505";

/**
 * Save (create or update) the caller's in-progress onboarding draft and return
 * it with the recomputed percentage and fresh `lastSavedAt`. Throws
 * `UnauthenticatedError` (no session, via the guard), `ValidationError` (bad
 * envelope), `ConflictError` (lost the in-progress race), or `InternalError`
 * (query failure).
 */
export async function saveDraft(body: JsonObject): Promise<DraftDto> {
  const user = await requireAuthUser();
  const { currentStep, draftData } = parseDraftUpdate(body);

  const completionPercentage = computeCompletionPercentage(draftData);
  const lastSavedAt = new Date().toISOString();
  // `draft_data` is an opaque `Json` column; the payload is a structurally-
  // validated JSON object (leaf shapes checked at completion, P2-6).
  const draftDataForStorage = draftData as Json;

  const supabase = await createServerSupabaseClient();

  // Update the existing in-progress draft, if there is one.
  const { data: updated, error: updateError } = await supabase
    .from("household_profile_drafts")
    .update({
      current_step: currentStep,
      completion_percentage: completionPercentage,
      draft_data: draftDataForStorage,
      last_saved_at: lastSavedAt,
    })
    .eq("user_id", user.id)
    .eq("status", "in_progress")
    .select(DRAFT_SELECT)
    .maybeSingle();

  if (updateError) {
    throw new InternalError("Failed to save onboarding draft.", {
      cause: updateError,
    });
  }
  if (updated) {
    return toDraftDto(updated);
  }

  // No in-progress draft yet — create one.
  const { data: inserted, error: insertError } = await supabase
    .from("household_profile_drafts")
    .insert({
      user_id: user.id,
      status: "in_progress",
      current_step: currentStep,
      completion_percentage: completionPercentage,
      draft_data: draftDataForStorage,
      last_saved_at: lastSavedAt,
    })
    .select(DRAFT_SELECT)
    .single();

  if (insertError) {
    if (insertError.code === UNIQUE_VIOLATION) {
      throw new ConflictError(
        "An onboarding draft is already in progress.",
        { reason: "draft_in_progress" },
        { cause: insertError },
      );
    }
    throw new InternalError("Failed to create onboarding draft.", {
      cause: insertError,
    });
  }

  return toDraftDto(inserted);
}
