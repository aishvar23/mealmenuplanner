import "server-only";

import { requireAuthUser } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/db/server";
import { InternalError, NotFoundError } from "@/lib/errors";
import { isUuid } from "@/lib/validation";

/**
 * `notification` service — mark read (P8-3, design/09 § 7, § 9). Idempotent:
 * `read_at` is set only when currently `null`, so a second call is a no-op and
 * returns the same `readAt`. RLS (`notif_update`) restricts writes to the
 * recipient; a row hidden by RLS reads back as `null` → `NotFoundError`
 * (existence-hiding). We also filter `recipient_user_id` explicitly for clarity.
 */

export interface MarkReadResult {
  id: string;
  readAt: string;
}

export async function markNotificationRead(
  notificationId: string,
): Promise<MarkReadResult> {
  const user = await requireAuthUser();
  if (!isUuid(notificationId)) {
    throw new NotFoundError("Notification not found.");
  }
  const supabase = await createServerSupabaseClient();
  const nowIso = new Date().toISOString();

  // Set read_at only on the still-unread row (idempotent write).
  const { data: updated, error: updateError } = await supabase
    .from("notifications")
    .update({ read_at: nowIso })
    .eq("id", notificationId)
    .eq("recipient_user_id", user.id)
    .is("read_at", null)
    .select("id, read_at")
    .maybeSingle();
  if (updateError) {
    throw new InternalError("Failed to mark notification read.", {
      cause: updateError,
    });
  }
  if (updated?.read_at) {
    return { id: updated.id, readAt: updated.read_at };
  }

  // No row updated: it was already read, or does not exist / isn't ours. Re-read
  // to disambiguate (a second mark-read is a no-op, not a 404).
  const { data: existing, error: readError } = await supabase
    .from("notifications")
    .select("id, read_at")
    .eq("id", notificationId)
    .eq("recipient_user_id", user.id)
    .maybeSingle();
  if (readError) {
    throw new InternalError("Failed to load notification.", {
      cause: readError,
    });
  }
  if (!existing) {
    throw new NotFoundError("Notification not found.");
  }
  return { id: existing.id, readAt: existing.read_at ?? nowIso };
}

/**
 * Mark every unread notification read in one statement (the optional companion
 * that clears the badge, design/09 § 7). Optionally scoped to one household
 * (BETA — per-household view), so "mark all read" on a filtered inbox only clears
 * that household. Returns how many were cleared.
 */
export async function markAllNotificationsRead(
  householdId?: string,
): Promise<{ updated: number }> {
  const user = await requireAuthUser();
  const supabase = await createServerSupabaseClient();

  let query = supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("recipient_user_id", user.id)
    .is("read_at", null);
  if (householdId) {
    query = query.eq("household_id", householdId);
  }

  const { data, error } = await query.select("id");
  if (error) {
    throw new InternalError("Failed to mark notifications read.", {
      cause: error,
    });
  }
  return { updated: (data ?? []).length };
}
