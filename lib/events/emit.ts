import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/db/database.types";
import { InternalError } from "@/lib/errors";

import { sendEventEmails } from "./email-fanout";
import { renderNotification } from "./templates";
import type { EmitEventInput } from "./types";

/**
 * `lib/events` — the activity-event writer + notification fan-out (P8-1/P8-2,
 * design/09 § 3, § 4). One domain change becomes exactly one
 * `household_activity_events` audit row plus 0..N `notifications` rows (one per
 * recipient), written atomically by the `emit_household_event` SECURITY DEFINER
 * RPC. We call the RPC on the caller's per-request RLS client (never the
 * service-role client, which is banned from request paths): the function bypasses
 * RLS to write the no-user-insert tables but re-checks active membership so the
 * bypass stays tenancy-safe.
 *
 * The title/message are rendered here once (design/09 § 6) and handed to the RPC,
 * so every recipient row is self-contained. The actor is excluded from the
 * recipient set inside the RPC — a member is never notified about their own
 * action (roadmap P8 acceptance: "Actor does not receive duplicate notification").
 */

type ServerClient = SupabaseClient<Database>;

/**
 * Write the audit row and fan out notifications for one domain change. Throws on
 * failure — prefer {@link safeEmitHouseholdEvent} from a domain service so a
 * notification glitch never fails the user's action.
 */
export async function emitHouseholdEvent(
  supabase: ServerClient,
  input: EmitEventInput,
): Promise<void> {
  const { title, message } = renderNotification(input.eventType, input.vars);

  const { error } = await supabase.rpc("emit_household_event", {
    p_household_id: input.householdId,
    p_event_type: input.eventType,
    p_entity_type: input.entityType,
    p_entity_id: input.entityId ?? null,
    p_old_value: input.oldValue ?? null,
    p_new_value: input.newValue ?? null,
    p_title: title,
    p_message: message,
    p_extra_recipient_ids: input.extraRecipientIds ?? null,
  });

  if (error) {
    throw new InternalError("Failed to emit household event.", {
      cause: error,
    });
  }
}

/**
 * Best-effort variant: emits the event and swallows any failure (logged
 * server-side). Domain services call this AFTER their own mutation has committed,
 * so a notification problem is recoverable and never rolls back the user's change
 * — the same pattern as `safeRegenerateGroceryListForPlan` (P7).
 */
export async function safeEmitHouseholdEvent(
  supabase: ServerClient,
  input: EmitEventInput,
): Promise<void> {
  try {
    await emitHouseholdEvent(supabase, input);
  } catch (error) {
    console.error("[events] failed to emit household event", {
      eventType: input.eventType,
      householdId: input.householdId,
      error,
    });
    return;
  }

  // In-app write committed — now fan out opt-in email (P9), best-effort and a
  // no-op when no email transport is configured. Kept separate so an email
  // glitch never rolls back or masks the committed in-app notification.
  try {
    await sendEventEmails(supabase, input);
  } catch (error) {
    console.error("[events] failed to fan out event email", {
      eventType: input.eventType,
      householdId: input.householdId,
      error,
    });
  }
}
