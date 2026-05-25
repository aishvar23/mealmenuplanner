import "server-only";

import { getActiveMembership, requireAuthUser } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/db/server";
import { InternalError, NotFoundError, ValidationError } from "@/lib/errors";
import type { JsonObject } from "@/lib/http";
import { isUuid } from "@/lib/validation";

/**
 * `household` service — the caller's own member-level food preferences
 * (`user_food_preferences`), the member-scoped counterpart to the
 * household-scoped {@link updatePreferences} (P1-7).
 *
 * Today this covers the **preferred dishes** the household likes (BUG-006): the
 * onboarding create flow writes them to the owner's `liked_dishes` via
 * `complete_onboarding`, and edit mode round-trips them here — seed the wizard
 * from {@link getMyLikedDishes}, save with {@link updateMyFoodPreferences}. The
 * engine rewards a liked dish with its "+10 dish your household likes" soft bonus
 * (`lib/recommendation/scoring.ts`).
 *
 * Authorization is **self-write**, not permission-gated: a member always edits
 * their own preferences (RLS `ufp_update`/`ufp_insert` are keyed to
 * `auth.uid()`). We still require active membership so a non-member gets the
 * tenancy-safe 404, never a hint the household exists (design/04 § 2).
 */

/** The caller's editable member-level food preferences, as the API exposes them. */
export interface MyFoodPreferencesDto {
  /** Dish names the household likes; feed the engine's liked-dish bonus. */
  likedDishes: string[];
}

/** Trim each entry, drop blanks, and de-duplicate (order-preserving). */
function cleanDishNames(value: unknown): string[] {
  if (!Array.isArray(value)) {
    throw new ValidationError("likedDishes must be an array of dish names.", [
      { field: "likedDishes", rule: "stringArray" },
    ]);
  }
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of value) {
    if (typeof item !== "string") {
      throw new ValidationError("likedDishes must be an array of dish names.", [
        { field: "likedDishes", rule: "stringArray" },
      ]);
    }
    const trimmed = item.trim();
    if (trimmed.length > 0 && !seen.has(trimmed)) {
      seen.add(trimmed);
      out.push(trimmed);
    }
  }
  return out;
}

/**
 * Read the caller's `liked_dishes` for a household — used to seed the edit-mode
 * preferred-dishes step. Returns `[]` when the caller has no
 * `user_food_preferences` row yet (e.g. they chose "let the system decide" at
 * onboarding and set no allergies). Throws `UnauthenticatedError` (no session)
 * or `InternalError` (query failure). The read runs under the per-request RLS
 * client, where `ufp_select` already scopes the row to `auth.uid()`.
 */
export async function getMyLikedDishes(householdId: string): Promise<string[]> {
  if (!isUuid(householdId)) return [];

  const user = await requireAuthUser();
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from("user_food_preferences")
    .select("liked_dishes")
    .eq("household_id", householdId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    throw new InternalError("Failed to load your food preferences.", {
      cause: error,
    });
  }
  return data?.liked_dishes ?? [];
}

/**
 * Apply a partial update to the caller's own member-level food preferences,
 * returning the updated values. Upserts the `(user_id, household_id)` row so it
 * works whether or not onboarding created one. Only the provided fields are
 * written, so existing allergies/dislikes are preserved.
 *
 * Throws `UnauthenticatedError` (no session, via the guard), `NotFoundError`
 * (not an active member, or malformed id — tenancy-safe), `ValidationError`
 * (no recognized field, or a malformed `likedDishes`), or `InternalError`
 * (query failure).
 */
export async function updateMyFoodPreferences(
  householdId: string,
  body: JsonObject,
): Promise<MyFoodPreferencesDto> {
  if (!isUuid(householdId)) {
    throw new NotFoundError("Household not found.");
  }

  const user = await requireAuthUser();

  const membership = await getActiveMembership(householdId);
  if (!membership) {
    throw new NotFoundError("Household not found.");
  }

  if (!Object.hasOwn(body, "likedDishes")) {
    throw new ValidationError(
      "At least one food-preference field is required.",
      [{ field: "body", rule: "nonEmpty" }],
    );
  }
  const likedDishes = cleanDishNames(body.likedDishes);

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("user_food_preferences")
    .upsert(
      {
        user_id: user.id,
        household_id: householdId,
        liked_dishes: likedDishes,
      },
      { onConflict: "user_id,household_id" },
    )
    .select("liked_dishes")
    .single();

  if (error) {
    throw new InternalError("Failed to update your food preferences.", {
      cause: error,
    });
  }

  return { likedDishes: data.liked_dishes };
}
