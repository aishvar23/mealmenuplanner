/**
 * The notifier port (design/09 § 1). The `notification` service depends on this
 * interface, never on a concrete provider, so push / WhatsApp / SMS can be added
 * later by registering one adapter — no domain code changes. Pure + client-safe
 * (the concrete adapters that do I/O are `server-only`).
 */

export type Channel = "inApp" | "email" | "push" | "whatsapp" | "sms";

/** The self-contained data an adapter needs to deliver one notification. */
export interface NotificationPayload {
  householdId: string;
  recipientUserId: string;
  actorUserId: string | null;
  /** Matches `notifications.event_type`. */
  eventType: string;
  title: string;
  message: string;
}

export interface Notifier {
  readonly channel: Channel;
  /** Best-effort dispatch. Throws only on retryable transport errors (design/09 § 9). */
  send(payload: NotificationPayload): Promise<void>;
}
