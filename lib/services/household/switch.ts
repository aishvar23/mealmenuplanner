import "server-only";

import { requireAuthUser } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/db/server";
import { ForbiddenError, InternalError } from "@/lib/errors";
import { isUuid } from "@/lib/validation";

/**
 * Household switcher service (BETA) — set which household the caller is viewing
 * (`active`) and their default-on-login household (`preferred`). Both persist on
 * the `users` row so the choice follows the user across sessions and devices.
 *
 * The writes go through the `set_active_household` / `set_preferred_household`
 * SECURITY DEFINER RPCs (migration p9_beta_feedback), which verify the target via
 * `is_active_member` before updating — so a caller can only point at a household
 * they actively belong to (a stale/forged id is rejected, not silently stored).
 */

const PG_INSUFFICIENT_PRIVILEGE = "42501"; // RPC raised: not an active member

async function callPointerRpc(
  rpc: "set_active_household" | "set_preferred_household",
  householdId: string,
): Promise<void> {
  await requireAuthUser();
  if (!isUuid(householdId)) {
    // A non-member household reads as "you can't switch to that" either way.
    throw new ForbiddenError("You are not a member of that household.");
  }

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.rpc(rpc, { h: householdId });
  if (error) {
    if (error.code === PG_INSUFFICIENT_PRIVILEGE) {
      throw new ForbiddenError("You are not a member of that household.", {
        cause: error,
      });
    }
    throw new InternalError("Failed to update your household selection.", {
      cause: error,
    });
  }
}

/** Switch the caller's currently-viewed household. */
export function setActiveHousehold(householdId: string): Promise<void> {
  return callPointerRpc("set_active_household", householdId);
}

/** Set the caller's preferred (default-on-login) household. */
export function setPreferredHousehold(householdId: string): Promise<void> {
  return callPointerRpc("set_preferred_household", householdId);
}
