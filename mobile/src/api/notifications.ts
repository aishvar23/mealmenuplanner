import { apiRequest } from "./client";
import type {
  MarkReadResult,
  NotificationEmailPreferences,
  NotificationInbox,
  ReadAllResult,
} from "./types";

/**
 * Notification endpoints (design/09 § 7). The inbox is cursor-paginated and
 * carries the unread badge count alongside its items; mark-read / read-all clear
 * the badge. Email opt-ins are per-household. All are self-scoped server-side.
 */

export interface ListNotificationsParams {
  unreadOnly?: boolean;
  cursor?: string | null;
  limit?: number;
  /** Optional — scope to one household; omitted spans all. */
  householdId?: string;
}

/** `GET /api/notifications` — the caller's inbox. */
export function listNotifications(
  params: ListNotificationsParams = {},
): Promise<NotificationInbox> {
  return apiRequest<NotificationInbox>("/api/notifications", {
    query: {
      unreadOnly: params.unreadOnly ? "true" : undefined,
      cursor: params.cursor ?? undefined,
      limit: params.limit,
      householdId: params.householdId,
    },
  });
}

/** `POST /api/notifications/{id}/read` — mark one notification read (idempotent). */
export function markRead(notificationId: string): Promise<MarkReadResult> {
  return apiRequest<MarkReadResult>(
    `/api/notifications/${notificationId}/read`,
    { method: "POST" },
  );
}

/** `POST /api/notifications/read-all` — clear the badge (optionally one household). */
export function markAllRead(householdId?: string): Promise<ReadAllResult> {
  return apiRequest<ReadAllResult>("/api/notifications/read-all", {
    method: "POST",
    query: { householdId },
  });
}

/** `GET /api/notification-preferences` — the caller's email opt-ins for a household. */
export function getEmailPreferences(
  householdId: string,
): Promise<NotificationEmailPreferences> {
  return apiRequest<NotificationEmailPreferences>(
    "/api/notification-preferences",
    { query: { householdId } },
  );
}

/** `PUT /api/notification-preferences` — save the caller's email opt-ins. */
export function updateEmailPreferences(
  householdId: string,
  categories: Record<string, boolean>,
): Promise<NotificationEmailPreferences> {
  return apiRequest<NotificationEmailPreferences>(
    "/api/notification-preferences",
    { method: "PUT", body: { householdId, categories } },
  );
}
