import "server-only";

import { EmailNotifier } from "./email";
import type { EventEmailParams } from "./event-email";
import { ExpoPushNotifier, type EventPushParams } from "./expo-push";
import type { InviteEmailParams } from "./invite-email";
import { getNotifierRegistry, type NotifierRegistry } from "./registry";

/**
 * Channel routing (design/09 § 5). In MVP the decision is static — in-app rows
 * are persisted by the fan-out RPC (§4), email fires only for the invite, and
 * push / WhatsApp / SMS are no-ops. The seam is here so V2 can read
 * `notification_preferences` and enable per-recipient channels without touching
 * domain services.
 */

/**
 * Outcome of the best-effort invite email so the caller can tell the inviter
 * whether the invitee was actually emailed or they should share the link
 * manually (design/09 § 5, § 9). `not_configured` means no transport is wired
 * (e.g. `RESEND_API_KEY` unset); `failed` means the send was attempted but the
 * transport errored after its own retries.
 */
export type InviteEmailOutcome = "sent" | "not_configured" | "failed";

/**
 * Send the invite email, best-effort (design/09 § 5, § 9). Resolves the email
 * adapter from the registry; logs and swallows any transport failure so a failed
 * email never fails invite creation (the invite is persisted and the link is
 * also returned for manual sharing). Returns the {@link InviteEmailOutcome} so
 * the UI can reflect what happened; a no-op (`not_configured`) when the
 * transport is unconfigured.
 */
export async function sendInviteEmail(
  params: InviteEmailParams,
  registry: NotifierRegistry = getNotifierRegistry(),
): Promise<InviteEmailOutcome> {
  const notifier = registry.get("email");
  if (!(notifier instanceof EmailNotifier) || !notifier.isConfigured) {
    return "not_configured";
  }
  try {
    await notifier.sendInvite(params);
    return "sent";
  } catch (error) {
    console.error("[events] failed to send invite email", {
      household: params.householdName,
      error,
    });
    return "failed";
  }
}

/**
 * Send one generic household-event email, best-effort (P9). Same shape as
 * {@link sendInviteEmail}: resolves the email adapter, no-ops when unconfigured,
 * and swallows transport failures (returning `"failed"`) so the per-recipient
 * fan-out keeps going. Title/message are excluded from the log (the body can be
 * benign, but we keep logs lean and recipient-anonymous).
 */
export async function sendEventEmail(
  params: EventEmailParams,
  registry: NotifierRegistry = getNotifierRegistry(),
): Promise<InviteEmailOutcome> {
  const notifier = registry.get("email");
  if (!(notifier instanceof EmailNotifier) || !notifier.isConfigured) {
    return "not_configured";
  }
  try {
    await notifier.sendEvent(params);
    return "sent";
  } catch (error) {
    console.error("[events] failed to send event email", { error });
    return "failed";
  }
}

/** True when an email transport is wired (RESEND_API_KEY present). */
export function isEmailConfigured(
  registry: NotifierRegistry = getNotifierRegistry(),
): boolean {
  const notifier = registry.get("email");
  return notifier instanceof EmailNotifier && notifier.isConfigured;
}

/**
 * Push one household event to a set of device targets, best-effort (design/10
 * § 7). Resolves the push adapter; no-ops when unconfigured (`EXPO_ACCESS_TOKEN`
 * unset). Swallows transport failures so a failed push never affects the
 * committed in-app/email notifications. Returns the same outcome shape as the
 * email senders.
 */
export async function sendEventPush(
  params: EventPushParams,
  registry: NotifierRegistry = getNotifierRegistry(),
): Promise<InviteEmailOutcome> {
  const notifier = registry.get("push");
  if (!(notifier instanceof ExpoPushNotifier) || !notifier.isConfigured) {
    return "not_configured";
  }
  try {
    await notifier.sendEvent(params);
    return "sent";
  } catch (error) {
    console.error("[events] failed to send event push", { error });
    return "failed";
  }
}

/** True when a push transport is wired (EXPO_ACCESS_TOKEN present). */
export function isPushConfigured(
  registry: NotifierRegistry = getNotifierRegistry(),
): boolean {
  const notifier = registry.get("push");
  return notifier instanceof ExpoPushNotifier && notifier.isConfigured;
}
