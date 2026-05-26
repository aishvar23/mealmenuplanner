import "server-only";

import { requireAuthUser } from "@/lib/auth";
import type { Json } from "@/lib/db/database.types";
import { createServerSupabaseClient } from "@/lib/db/server";
import {
  ConflictError,
  InternalError,
  NotFoundError,
  ValidationError,
} from "@/lib/errors";
import type { JsonObject } from "@/lib/http";
import type { DraftData } from "@/lib/onboarding";
import { isUuid } from "@/lib/validation/uuid";

import { buildCompletionPayload } from "./validate-completion";

/**
 * `onboarding` service — completion (P2-6).
 *
 * Backs `POST /api/onboarding/complete` (design/06 § 7, design/04 § 4.2): promote
 * the caller's draft into the live `households` + `household_preferences` +
 * (optional) `user_food_preferences` + owner `household_members` rows, mark the
 * draft `completed`, and return its `householdId`. The atomic, RLS-bootstrapping
 * write is the `complete_onboarding` SECURITY DEFINER function (migration P2-6);
 * this service validates input and orchestrates the call.
 *
 * Idempotency (design/06 § 7): an already-`completed` draft short-circuits here
 * and returns its `householdId` without re-validating or re-writing. The SQL
 * function repeats the check under a `FOR UPDATE` lock as the race backstop, so a
 * concurrent double-Finish resolves to one household.
 */

export interface CompleteOnboardingResult {
  householdId: string;
  status: "completed";
}

/** Postgres error codes the SQL function raises / the DB enforces. */
const PG_NO_DATA_FOUND = "P0002"; // draft vanished between our read and the lock
const PG_CHECK_VIOLATION = "23514"; // draft is no longer in_progress (raced)
const PG_UNIQUE_VIOLATION = "23505"; // a 1:1 row already exists (prefs/membership)

/** Shape the SQL function returns as its `jsonb` result. */
interface CompleteRpcResult {
  householdId: string;
  status: string;
}

/**
 * Complete the caller's onboarding draft. Throws `UnauthenticatedError` (no
 * session), `ValidationError` (bad `draftId` or incomplete/invalid draft),
 * `NotFoundError` (no such draft owned by the caller), `ConflictError`
 * (already-completed-race / terminal draft), or `InternalError` (RPC failure).
 */
export async function completeOnboarding(
  body: JsonObject,
): Promise<CompleteOnboardingResult> {
  const user = await requireAuthUser();

  const draftId = body.draftId;
  if (typeof draftId !== "string" || !isUuid(draftId)) {
    throw new ValidationError("A valid draftId is required.", [
      { field: "draftId", rule: "uuid" },
    ]);
  }

  const supabase = await createServerSupabaseClient();

  // Load the draft (scoped to the caller via RLS + explicit user_id) to validate
  // its data and short-circuit an already-completed one before opening the TXN.
  const { data: draft, error: loadError } = await supabase
    .from("household_profile_drafts")
    .select("id, status, household_id, draft_data")
    .eq("id", draftId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (loadError) {
    throw new InternalError("Failed to load onboarding draft.", {
      cause: loadError,
    });
  }
  if (!draft) {
    throw new NotFoundError("Onboarding draft not found.");
  }

  // Idempotent replay: already completed → return its household, write nothing.
  if (draft.status === "completed") {
    if (!draft.household_id) {
      throw new InternalError("Completed draft has no household.");
    }
    return { householdId: draft.household_id, status: "completed" };
  }

  // Abandoned is terminal (design/06 § 4): it can't be completed.
  if (draft.status !== "in_progress") {
    throw new ConflictError("This onboarding draft is no longer active.", {
      reason: "draft_not_in_progress",
    });
  }

  // Strict, authoritative validation (the autosave PUT was lenient). Throws a
  // ValidationError listing every missing/invalid field; the draft stays
  // in_progress (no write happened).
  const payload = buildCompletionPayload((draft.draft_data ?? {}) as DraftData);

  const { data, error } = await supabase.rpc("complete_onboarding", {
    p_draft_id: draftId,
    // The payloads are plain JSON-serializable objects; the typed interfaces
    // lack an index signature so we widen through `unknown` to the `Json` param.
    p_household: payload.household as unknown as Json,
    p_preferences: payload.preferences as unknown as Json,
    p_food_preferences: (payload.foodPreferences ?? null) as unknown as Json,
    p_combination_prefs: (payload.combinationPrefs ?? null) as unknown as Json,
  });

  if (error) {
    if (error.code === PG_NO_DATA_FOUND) {
      throw new NotFoundError("Onboarding draft not found.", { cause: error });
    }
    if (
      error.code === PG_CHECK_VIOLATION ||
      error.code === PG_UNIQUE_VIOLATION
    ) {
      // Lost the completion race / a 1:1 row already exists — the client should
      // re-read; the draft is (or is becoming) completed.
      throw new ConflictError("This onboarding was already completed.", {
        reason: "already_completed",
      });
    }
    throw new InternalError("Failed to complete onboarding.", { cause: error });
  }

  const result = data as CompleteRpcResult | null;
  if (!result?.householdId) {
    throw new InternalError("Onboarding completion returned no household.");
  }

  return { householdId: result.householdId, status: "completed" };
}
