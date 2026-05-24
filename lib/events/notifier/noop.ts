import type { Channel, NotificationPayload, Notifier } from "./port";

/**
 * No-op adapters (design/09 § 1, § 5). Registered so the wiring exists before the
 * providers do: push / WhatsApp / SMS are MVP no-ops, and `inApp` is a no-op in
 * the post-commit dispatch path because in-app rows are written by the fan-out
 * RPC inside the transaction (design/09 § 4 / § 5 — "in-app is the §4 insert, not
 * a separate send"), not re-sent here. They always succeed, so MVP routing has no
 * partial-failure surface beyond email.
 */
export function createNoopNotifier(channel: Channel): Notifier {
  return {
    channel,
    async send(payload: NotificationPayload): Promise<void> {
      // Intentionally does nothing — see module docstring.
      void payload;
    },
  };
}
