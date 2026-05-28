import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/db/database.types";

import { categoryForEvent } from "./categories";
import { isEmailConfigured, sendEventEmail } from "./notifier";
import { renderNotification } from "./templates";
import type { EmitEventInput } from "./types";

/**
 * Email fan-out for a household event (P9). The opt-in companion to the in-app
 * fan-out in `emit_household_event`: for each recipient who turned ON email for
 * this event's category, send the SAME `{title, message}` the inbox row carries.
 *
 * Called from `safeEmitHouseholdEvent` AFTER the in-app write commits, so email
 * is strictly additive and best-effort — a failure here never affects the
 * committed notification. It is a true no-op when no email transport is wired
 * (RESEND unset, as in dev/CI): the configured-check short-circuits before any
 * DB call, so there's zero overhead until email is actually turned on.
 *
 * Recipient resolution (including the actor exclusion and extra/affected
 * recipients) lives in the `get_event_email_recipients` SECURITY DEFINER RPC,
 * which also reads recipient emails past RLS safely.
 */

type ServerClient = SupabaseClient<Database>;

export async function sendEventEmails(
  supabase: ServerClient,
  input: EmitEventInput,
): Promise<void> {
  // No transport → nothing to do, and crucially no DB round-trip.
  if (!isEmailConfigured()) return;

  const category = categoryForEvent(input.eventType);

  const { data: recipients, error } = await supabase.rpc(
    "get_event_email_recipients",
    {
      p_household_id: input.householdId,
      p_event_category: category,
      p_extra_recipient_ids: input.extraRecipientIds ?? null,
    },
  );
  if (error) {
    console.error("[events] failed to resolve email recipients", {
      eventType: input.eventType,
      householdId: input.householdId,
      error,
    });
    return;
  }
  if (!recipients || recipients.length === 0) return;

  // Reuse the in-app render so email and inbox read identically (design/09 § 6).
  const { title, message } = renderNotification(input.eventType, input.vars);
  const appBaseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";

  // One failed send must not abort the rest; sendEventEmail already swallows
  // transport errors, allSettled is the belt-and-braces guard.
  await Promise.allSettled(
    recipients
      .filter((r) => Boolean(r.email))
      .map((r) =>
        sendEventEmail({ toEmail: r.email, title, message, appBaseUrl }),
      ),
  );
}
