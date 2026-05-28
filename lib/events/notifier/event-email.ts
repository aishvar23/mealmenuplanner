import { escapeHtml } from "./html";

/**
 * Generic household-event email (P9). Unlike the invite email (the one-off
 * external send), this reuses the SAME `{title, message}` the in-app notification
 * already rendered (lib/events/templates), so email and inbox read identically.
 * Pure + client-safe so it's unit-testable without a transport. Sent only to
 * recipients who opted in to the event's category (notification_email_preferences).
 */

export interface EventEmailParams {
  toEmail: string;
  /** The rendered notification title (becomes the subject). */
  title: string;
  /** The rendered notification message (the body). */
  message: string;
  /** App base URL for the "View in app" link; "" falls back to a relative path. */
  appBaseUrl: string;
}

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

/** Render the event email (subject + HTML + text) for a transactional send. */
export function renderEventEmail(params: EventEmailParams): RenderedEmail {
  const { title, message, appBaseUrl } = params;
  const notificationsUrl = `${appBaseUrl.replace(/\/+$/, "")}/notifications`;

  const subject = title;

  const text = [
    message,
    "",
    `View in Home Meal Planner: ${notificationsUrl}`,
    "",
    "You're receiving this because you turned on email for this kind of update. Change it under Notification settings.",
  ].join("\n");

  const html = [
    `<div style="font-family: system-ui, sans-serif; line-height: 1.5;">`,
    `<p style="font-weight:600;margin:0 0 4px;">${escapeHtml(title)}</p>`,
    `<p style="margin:0 0 16px;">${escapeHtml(message)}</p>`,
    `<p><a href="${escapeHtml(notificationsUrl)}" style="display:inline-block;padding:10px 16px;background:#16a34a;color:#fff;border-radius:6px;text-decoration:none;">View in app</a></p>`,
    `<p style="font-size:12px;color:#666;">You're receiving this because you turned on email for this kind of update. Change it under Notification settings.</p>`,
    `</div>`,
  ].join("");

  return { subject, html, text };
}
