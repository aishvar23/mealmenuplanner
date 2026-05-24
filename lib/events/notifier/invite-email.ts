import { formatShortDate } from "../format";

import { escapeHtml } from "./html";

/**
 * Invite-email content (design/09 § 5 — the one external send in MVP). Pure +
 * client-safe: builds the HTML + plain-text bodies so they can be unit-tested
 * without a transport. The link carries the one-time plaintext invite token (the
 * row stores only its hash, P6-1), so the email body is the secret-bearing
 * channel — it is never logged.
 */

export interface InviteEmailParams {
  toEmail: string;
  inviteLink: string;
  householdName: string;
  inviterName: string;
  /** Invite expiry (ISO) — appended as a deadline when present. */
  expiresAt: string | null;
}

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

/** Render the invite email (subject + HTML + text) for a transactional send. */
export function renderInviteEmail(params: InviteEmailParams): RenderedEmail {
  const { inviteLink, householdName, inviterName, expiresAt } = params;

  const subject = `You're invited to ${householdName} on Home Meal Planner`;
  const expiryLine = expiresAt
    ? `This invite expires on ${formatShortDate(expiresAt)}.`
    : "";

  const text = [
    `${inviterName} invited you to join "${householdName}" on Home Meal Planner.`,
    "",
    `Accept your invite: ${inviteLink}`,
    expiryLine,
  ]
    .filter(Boolean)
    .join("\n");

  const html = [
    `<div style="font-family: system-ui, sans-serif; line-height: 1.5;">`,
    `<p>${escapeHtml(inviterName)} invited you to join <strong>${escapeHtml(householdName)}</strong> on Home Meal Planner.</p>`,
    `<p><a href="${escapeHtml(inviteLink)}" style="display:inline-block;padding:10px 16px;background:#16a34a;color:#fff;border-radius:6px;text-decoration:none;">Accept invite</a></p>`,
    `<p style="font-size:12px;color:#666;">Or paste this link into your browser:<br>${escapeHtml(inviteLink)}</p>`,
    expiryLine
      ? `<p style="font-size:12px;color:#666;">${escapeHtml(expiryLine)}</p>`
      : "",
    `</div>`,
  ]
    .filter(Boolean)
    .join("");

  return { subject, html, text };
}
