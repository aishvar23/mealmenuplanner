import "server-only";

import { getActiveMembership, hasPermission } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/db/server";
import { ForbiddenError, InternalError, NotFoundError } from "@/lib/errors";
import type { JsonObject } from "@/lib/http";
import { regenerateExistingGroceryListsForHousehold } from "@/lib/services/grocery";
import { isUuid } from "@/lib/validation";

import { toPreferencesDto, type PreferencesDto } from "./dto";
import { buildPreferencesUpdate } from "./validate-preferences";

/**
 * `household` service — preferences update (P1-7).
 *
 * Backs `PATCH /api/households/{householdId}/preferences` (design/04 § 4.1): a
 * partial update of any subset of preference fields, returning the full updated
 * preferences.
 *
 * Authorization follows design/04 § 2's FORBIDDEN-vs-NOT_FOUND policy exactly:
 *   - not an active member (or expired guest) → `NotFoundError` (404), so we
 *     never reveal a household exists across the tenancy boundary;
 *   - an active member who lacks `can_edit_household_preferences` → `ForbiddenError`
 *     (403), since the resource *is* known to be in their household.
 * RLS independently re-checks the same permission on the write.
 */

// Single string literal so supabase-js can infer the returned row shape; matches
// the GET projection so PATCH and GET return an identical preferences object.
const PREFERENCES_SELECT =
  "family_size, adults_count, kids_count, diet_type, diet_types, preferred_cuisines, spice_level, weekday_cooking_time_minutes, weekend_cooking_time_minutes, meals_to_plan, variety_gap_days, allow_leftovers, budget_preference";

/**
 * Apply a partial preferences update. Throws `UnauthenticatedError` (no session,
 * via the guard), `NotFoundError` (not a member, or no preferences row yet),
 * `ForbiddenError` (member without the edit flag), `ValidationError` (bad field),
 * or `InternalError` (query failure).
 */
export async function updatePreferences(
  householdId: string,
  body: JsonObject,
): Promise<PreferencesDto> {
  if (!isUuid(householdId)) {
    throw new NotFoundError("Household not found.");
  }

  const membership = await getActiveMembership(householdId);
  if (!membership) {
    throw new NotFoundError("Household not found.");
  }
  if (!hasPermission(membership, "can_edit_household_preferences")) {
    throw new ForbiddenError(
      "You don't have permission to edit household preferences.",
    );
  }

  // Validate + translate after authorization, so only an authorized member ever
  // learns whether their body was well-formed.
  const update = buildPreferencesUpdate(body);

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("household_preferences")
    .update(update)
    .eq("household_id", householdId)
    .select(PREFERENCES_SELECT)
    .maybeSingle();

  if (error) {
    throw new InternalError("Failed to update household preferences.", {
      cause: error,
    });
  }
  if (!data) {
    // No preferences row to update — a raw-created household has none until
    // onboarding (P2-6) writes one.
    throw new NotFoundError("Household preferences not found.");
  }

  // A family_size change rescales every grocery quantity (design/08 § 10, P7-3);
  // refresh any existing list for the household's active plans. Best-effort.
  if ("family_size" in update) {
    await regenerateExistingGroceryListsForHousehold(supabase, householdId);
  }

  return toPreferencesDto(data);
}
