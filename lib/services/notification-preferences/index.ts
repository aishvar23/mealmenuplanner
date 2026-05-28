import "server-only";

import { getActiveMembership, requireAuthUser } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/db/server";
import { InternalError, NotFoundError } from "@/lib/errors";
import { SETTABLE_EMAIL_CATEGORIES } from "@/lib/events/categories";
import type { JsonObject } from "@/lib/http";
import { isUuid } from "@/lib/validation";

import type { NotificationEmailPreferencesDto } from "./dto";
import { parseEmailPreferencesInput } from "./validate";

export type { NotificationEmailPreferencesDto } from "./dto";

/**
 * `notification-preferences` service — the caller's own EMAIL opt-ins per
 * household (`notification_email_preferences`, P9). Email is opt-in: the absence
 * of a row reads as `false`, so a fresh member gets an all-off map.
 *
 * Authorization is **self-write**, keyed to `auth.uid()` by RLS (`nep_*`), like
 * `updateMyFoodPreferences`. We still require active membership so a non-member
 * gets the tenancy-safe 404, never a hint the household exists (design/04 § 2).
 */

/** All settable categories initialised to `false` (the opt-in baseline). */
function allOff(): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  for (const category of SETTABLE_EMAIL_CATEGORIES) out[category] = false;
  return out;
}

/** Read the caller's email preferences for a household (missing → all off). */
export async function getMyEmailPreferences(
  householdId: string,
): Promise<NotificationEmailPreferencesDto> {
  if (!isUuid(householdId)) {
    throw new NotFoundError("Household not found.");
  }

  const user = await requireAuthUser();
  const membership = await getActiveMembership(householdId);
  if (!membership) {
    throw new NotFoundError("Household not found.");
  }

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("notification_email_preferences")
    .select("event_category, enabled")
    .eq("household_id", householdId)
    .eq("user_id", user.id);

  if (error) {
    throw new InternalError("Failed to load your notification settings.", {
      cause: error,
    });
  }

  const categories = allOff();
  for (const row of data ?? []) {
    if (Object.hasOwn(categories, row.event_category)) {
      categories[row.event_category] = row.enabled;
    }
  }
  return { householdId, categories };
}

/**
 * Save the caller's email preferences for a household. Upserts one row per
 * settable category (so the stored set always matches the form), keyed on
 * `(user_id, household_id, event_category)`. Throws `UnauthenticatedError`,
 * `NotFoundError` (non-member / malformed id), `ValidationError` (bad body), or
 * `InternalError`.
 */
export async function updateMyEmailPreferences(
  householdId: string,
  body: JsonObject,
): Promise<NotificationEmailPreferencesDto> {
  if (!isUuid(householdId)) {
    throw new NotFoundError("Household not found.");
  }

  const user = await requireAuthUser();
  const membership = await getActiveMembership(householdId);
  if (!membership) {
    throw new NotFoundError("Household not found.");
  }

  const categories = parseEmailPreferencesInput(body);

  const supabase = await createServerSupabaseClient();
  const rows = SETTABLE_EMAIL_CATEGORIES.map((category) => ({
    user_id: user.id,
    household_id: householdId,
    event_category: category,
    enabled: categories[category] ?? false,
  }));

  const { error } = await supabase
    .from("notification_email_preferences")
    .upsert(rows, { onConflict: "user_id,household_id,event_category" });

  if (error) {
    throw new InternalError("Failed to update your notification settings.", {
      cause: error,
    });
  }

  return { householdId, categories };
}
