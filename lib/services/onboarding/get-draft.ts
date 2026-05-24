import "server-only";

import { requireAuthUser } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/db/server";
import { InternalError } from "@/lib/errors";

import { toDraftDto, type DraftDto } from "./dto";

/**
 * `onboarding` service — draft read / resume detection (P2-2).
 *
 * Backs `GET /api/onboarding/draft` (design/06 § 6/§ 9): returns the caller's
 * single `in_progress` draft, or `null` when none exists (the client then starts
 * a fresh wizard; the first `PUT` creates the row).
 *
 * The draft is always scoped to `auth.uid()`: RLS (the self-only `hpd_all`
 * policy) restricts the read to the caller's own rows, and the
 * `uq_one_active_draft_per_user` partial unique index guarantees at most one
 * `in_progress` row — so `maybeSingle()` is exact. We also filter on `user_id`
 * explicitly as defense in depth.
 */

// Single string literal so supabase-js can statically infer the row shape; matches
// the DTO projection so GET and PUT return an identical draft object.
const DRAFT_SELECT =
  "id, status, current_step, completion_percentage, last_saved_at, draft_data";

/**
 * Load the caller's in-progress onboarding draft, or `null` if there is none.
 * Throws `UnauthenticatedError` (no session, via the guard) or `InternalError`
 * (query failure).
 */
export async function getDraft(): Promise<DraftDto | null> {
  const user = await requireAuthUser();

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("household_profile_drafts")
    .select(DRAFT_SELECT)
    .eq("user_id", user.id)
    .eq("status", "in_progress")
    .maybeSingle();

  if (error) {
    throw new InternalError("Failed to load onboarding draft.", {
      cause: error,
    });
  }

  return data ? toDraftDto(data) : null;
}
