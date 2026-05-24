import "server-only";

import { getActiveMembership } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/db/server";
import { InternalError, NotFoundError } from "@/lib/errors";
import { isUuid } from "@/lib/validation";

import {
  toCurrentUserPermissionsDto,
  toPreferencesDto,
  type HouseholdDto,
} from "./dto";

/**
 * `household` service — household read (P1-6).
 *
 * Backs `GET /api/households/{householdId}` (design/04 § 4.1): returns the
 * household, its preferences, and the caller's own role + permissions
 * (`currentUserPermissions`) so the client can hide controls it can't use.
 *
 * Access is gated by `getActiveMembership` — a non-member (or expired guest)
 * gets `null`, which we surface as `NOT_FOUND` rather than `FORBIDDEN` so we
 * never leak whether a household exists across the tenancy boundary (design/04
 * § 2). RLS independently re-applies the same membership check on every query.
 */

// Single string literals so supabase-js can statically infer the row shapes.
const HOUSEHOLD_SELECT = "id, name, created_by_user_id";
const PREFERENCES_SELECT =
  "family_size, adults_count, kids_count, diet_type, preferred_cuisines, spice_level, weekday_cooking_time_minutes, weekend_cooking_time_minutes, meals_to_plan, variety_gap_days, allow_leftovers, budget_preference";

/**
 * Load a household the caller can see. Throws `UnauthenticatedError` (no
 * session, via the guard), `NotFoundError` (no such household or the caller is
 * not an active member), or `InternalError` (query failure).
 */
export async function getHousehold(householdId: string): Promise<HouseholdDto> {
  // A malformed id can't name a real household — 404 it (existence-hiding)
  // before it reaches a query as an invalid-uuid error.
  if (!isUuid(householdId)) {
    throw new NotFoundError("Household not found.");
  }

  // Active-membership gate. `null` means "authenticated but not an active
  // member" — indistinguishable, by design, from "no such household".
  const membership = await getActiveMembership(householdId);
  if (!membership) {
    throw new NotFoundError("Household not found.");
  }

  const supabase = await createServerSupabaseClient();

  const { data: household, error: householdError } = await supabase
    .from("households")
    .select(HOUSEHOLD_SELECT)
    .eq("id", householdId)
    .maybeSingle();

  if (householdError) {
    throw new InternalError("Failed to load household.", {
      cause: householdError,
    });
  }
  if (!household) {
    // Membership row resolved but the household row is gone/hidden — treat as
    // not found rather than leaking the inconsistency.
    throw new NotFoundError("Household not found.");
  }

  // Preferences are optional: a raw-created household has none until onboarding
  // (P2-6) or a preferences update (P1-7) writes the row.
  const { data: preferences, error: preferencesError } = await supabase
    .from("household_preferences")
    .select(PREFERENCES_SELECT)
    .eq("household_id", householdId)
    .maybeSingle();

  if (preferencesError) {
    throw new InternalError("Failed to load household preferences.", {
      cause: preferencesError,
    });
  }

  return {
    id: household.id,
    name: household.name,
    createdByUserId: household.created_by_user_id,
    preferences: preferences ? toPreferencesDto(preferences) : null,
    currentUserPermissions: toCurrentUserPermissionsDto(membership),
  };
}
