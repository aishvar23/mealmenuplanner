import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/db/database.types";

import { isPushConfigured, sendEventPush } from "./notifier";
import { renderNotification } from "./templates";
import type { EmitEventInput } from "./types";

/**
 * Native-push fan-out for a household event (M3-2, design/10 § 7). The additive
 * companion to the in-app + email fan-outs: for each recipient who has a
 * registered device token, push the SAME `{title, message}` the inbox row carries.
 *
 * Called from `safeEmitHouseholdEvent` AFTER the in-app write commits, so push is
 * strictly additive and best-effort — a failure here never affects the committed
 * notification or the email send. It is a true no-op when no push transport is
 * wired (`EXPO_ACCESS_TOKEN` unset, as in dev/CI): the configured-check
 * short-circuits before any DB call, so there's zero overhead until push is on.
 *
 * Unlike email, push isn't gated by `notification_email_preferences` — registering
 * a device token (which needs OS push permission) IS the opt-in. Recipient + token
 * resolution lives in the `get_event_push_tokens` SECURITY DEFINER RPC, which
 * reads tokens past the self-only device_tokens RLS safely.
 */

type ServerClient = SupabaseClient<Database>;

export async function sendEventPushes(
  supabase: ServerClient,
  input: EmitEventInput,
): Promise<void> {
  // No transport → nothing to do, and crucially no DB round-trip.
  if (!isPushConfigured()) return;

  const { data: targets, error } = await supabase.rpc("get_event_push_tokens", {
    p_household_id: input.householdId,
    p_extra_recipient_ids: input.extraRecipientIds ?? null,
  });
  if (error) {
    console.error("[events] failed to resolve push tokens", {
      eventType: input.eventType,
      householdId: input.householdId,
      error,
    });
    return;
  }
  if (!targets || targets.length === 0) return;

  // Reuse the in-app render so push and inbox read identically (design/09 § 6).
  const { title, message } = renderNotification(input.eventType, input.vars);

  // sendEventPush already swallows transport errors and batches internally.
  await sendEventPush({
    targets: targets.map((t) => ({ token: t.token, platform: t.platform })),
    title,
    message,
    data: { householdId: input.householdId, eventType: input.eventType },
  });
}
