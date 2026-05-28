"use client";

/**
 * Browser-side fetch helpers for the notification endpoints (P8-3, design/09 § 7).
 * Thin `fetch` wrappers so the inbox + header badge share one place that knows
 * the URLs and shapes. The session rides in the HTTP-only auth cookies. Response
 * DTO types are `import type` (erased) so no server-only module reaches the bundle.
 */

import type {
  MarkReadResult,
  NotificationInbox,
} from "@/lib/services/notification";

export class NotificationRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
    this.name = "NotificationRequestError";
  }
}

async function request<T>(url: string, method: "GET" | "POST"): Promise<T> {
  const res = await fetch(url, { method, cache: "no-store" });
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    let code: string | undefined;
    try {
      const envelope = (await res.json()) as {
        error?: { message?: string; code?: string };
      };
      message = envelope.error?.message ?? message;
      code = envelope.error?.code;
    } catch {
      // Non-JSON body — keep the status-derived message.
    }
    throw new NotificationRequestError(message, res.status, code);
  }
  return (await res.json()) as T;
}

export function fetchNotifications(options?: {
  cursor?: string | null;
  unreadOnly?: boolean;
  limit?: number;
}): Promise<NotificationInbox> {
  const params = new URLSearchParams();
  if (options?.cursor) params.set("cursor", options.cursor);
  if (options?.unreadOnly) params.set("unreadOnly", "true");
  if (options?.limit) params.set("limit", String(options.limit));
  const qs = params.toString();
  return request(`/api/notifications${qs ? `?${qs}` : ""}`, "GET");
}

export function markRead(id: string): Promise<MarkReadResult> {
  return request(`/api/notifications/${id}/read`, "POST");
}

export function markAllRead(): Promise<{ updated: number }> {
  return request(`/api/notifications/read-all`, "POST");
}

/**
 * Cross-component signal that the unread set changed (e.g. the inbox marked
 * items read). The header bell lives in the persistent `(app)` shell, so it
 * never re-mounts when the inbox marks things read in the same tab — and a
 * same-tab read fires no `window` focus event either. This tiny `CustomEvent`
 * bus lets the inbox tell the bell to refetch its authoritative count.
 */
const UNREAD_CHANGED_EVENT = "hmp:notifications-changed";

/** Announce that the unread count may have changed. No-op outside the browser. */
export function emitUnreadChanged(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(UNREAD_CHANGED_EVENT));
}

/** Subscribe to unread-changed signals; returns an unsubscribe function. */
export function onUnreadChanged(callback: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(UNREAD_CHANGED_EVENT, callback);
  return () => window.removeEventListener(UNREAD_CHANGED_EVENT, callback);
}
