import "server-only";

import { EmailNotifier } from "./email";
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
 * Send the invite email, best-effort (design/09 § 5, § 9). Resolves the email
 * adapter from the registry; logs and swallows any transport failure so a failed
 * email never fails invite creation (the invite is persisted and the link is
 * also returned for manual sharing). A no-op when the transport is unconfigured.
 */
export async function sendInviteEmail(
  params: InviteEmailParams,
  registry: NotifierRegistry = getNotifierRegistry(),
): Promise<void> {
  try {
    const notifier = registry.get("email");
    if (notifier instanceof EmailNotifier) {
      await notifier.sendInvite(params);
    }
  } catch (error) {
    console.error("[events] failed to send invite email", {
      household: params.householdName,
      error,
    });
  }
}
