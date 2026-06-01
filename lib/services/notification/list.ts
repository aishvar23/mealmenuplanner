import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { requireAuthUser } from "@/lib/auth";
import type { Database } from "@/lib/db/database.types";
import { createServerSupabaseClient } from "@/lib/db/server";
import { InternalError } from "@/lib/errors";

import { decodeCursor, encodeCursor } from "./cursor";
import { toNotificationDto, type NotificationInbox } from "./dto";

/**
 * `notification` service — read the signed-in user's inbox (P8-3, design/09 § 7).
 * Reads are scoped to the recipient by RLS (`notif_select`); we also filter
 * `recipient_user_id = auth.uid()` explicitly for clarity. Cursor-paginated over
 * `(created_at desc, id desc)`, backed by the recipient index, with the unread
 * badge count returned alongside.
 */

const ROW_SELECT =
  "id, household_id, actor_user_id, event_type, title, message, read_at, created_at";

export const DEFAULT_LIMIT = 20;
export const MAX_LIMIT = 50;

export interface ListNotificationsParams {
  unreadOnly?: boolean;
  cursor?: string | null;
  limit?: number;
  /**
   * Scope the inbox to one household (BETA — per-household view). Omitted = all
   * households the user receives notifications in. RLS still restricts reads to
   * the recipient regardless.
   */
  householdId?: string;
}

function clampLimit(limit: number | undefined): number {
  if (!Number.isFinite(limit ?? NaN)) return DEFAULT_LIMIT;
  return Math.min(Math.max(Math.trunc(limit as number), 1), MAX_LIMIT);
}

export async function listNotifications(
  params: ListNotificationsParams = {},
): Promise<NotificationInbox> {
  const user = await requireAuthUser();
  const supabase = await createServerSupabaseClient();
  const limit = clampLimit(params.limit);

  let query = supabase
    .from("notifications")
    .select(ROW_SELECT)
    .eq("recipient_user_id", user.id)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit + 1); // one extra row reveals whether a next page exists

  if (params.householdId) {
    query = query.eq("household_id", params.householdId);
  }

  if (params.unreadOnly) {
    query = query.is("read_at", null);
  }

  if (params.cursor) {
    const cursor = decodeCursor(params.cursor);
    if (cursor) {
      // Keyset: rows strictly after the cursor in (created_at desc, id desc).
      query = query.or(
        `created_at.lt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},id.lt.${cursor.id})`,
      );
    }
  }

  const { data, error } = await query;
  if (error) {
    throw new InternalError("Failed to load notifications.", { cause: error });
  }

  const rows = data ?? [];
  const hasMore = rows.length > limit;
  const pageRows = hasMore ? rows.slice(0, limit) : rows;
  const last = pageRows[pageRows.length - 1];
  const nextCursor =
    hasMore && last
      ? encodeCursor({ createdAt: last.created_at, id: last.id })
      : null;

  // The badge/count reflects the same scope as the list (a household when
  // filtered, else all the recipient's notifications).
  const unreadCount = await getUnreadCount(
    supabase,
    user.id,
    params.householdId,
  );

  return {
    items: pageRows.map(toNotificationDto),
    unreadCount,
    nextCursor,
  };
}

/** Unread count for the recipient, optionally scoped to one household. */
async function getUnreadCount(
  supabase: SupabaseClient<Database>,
  userId: string,
  householdId?: string,
): Promise<number> {
  let query = supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("recipient_user_id", userId)
    .is("read_at", null);
  if (householdId) {
    query = query.eq("household_id", householdId);
  }
  const { count, error } = await query;
  if (error) {
    throw new InternalError("Failed to count unread notifications.", {
      cause: error,
    });
  }
  return count ?? 0;
}

/**
 * Standalone unread-count read for the app-shell badge (best-effort caller). Same
 * recipient-scoped count `listNotifications` returns, without loading the page.
 */
export async function getUnreadNotificationCount(): Promise<number> {
  const user = await requireAuthUser();
  const supabase = await createServerSupabaseClient();
  return getUnreadCount(supabase, user.id);
}
