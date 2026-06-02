import "server-only";

import {
  getExpoPushTransport,
  type ExpoPushMessage,
  type ExpoPushTransport,
} from "./expo-push-transport";
import type { Channel, NotificationPayload, Notifier } from "./port";

/** One recipient device the push fan-out delivers to. */
export interface PushTarget {
  token: string;
  platform: string;
}

/** The rendered notification to push (same `{title, message}` the inbox row carries). */
export interface EventPushParams {
  targets: PushTarget[];
  title: string;
  message: string;
  /** Optional deep-link payload (e.g. `{ householdId }`). */
  data?: Record<string, unknown>;
}

/**
 * The Expo Push adapter (design/10 § 7). Additive: it fans the SAME household
 * events that already write in-app rows and fire opt-in email out to a
 * recipient's registered devices. A no-op when no transport is configured
 * (`EXPO_ACCESS_TOKEN` unset), so email + in-app are never affected.
 *
 * Like {@link EmailNotifier}, the real entry point is {@link sendEvent} (batch,
 * driven by the push fan-out); the port's per-recipient `send()` exists only to
 * satisfy the `Notifier` contract and is not invoked by the MVP router.
 */
export class ExpoPushNotifier implements Notifier {
  readonly channel: Channel = "push";

  constructor(
    private readonly transport: ExpoPushTransport | null = getExpoPushTransport(),
  ) {}

  /** True when a transport is configured (`EXPO_ACCESS_TOKEN` present). */
  get isConfigured(): boolean {
    return this.transport !== null;
  }

  /** Port method — unused by MVP routing (the fan-out uses {@link sendEvent}). */
  async send(payload: NotificationPayload): Promise<void> {
    void payload;
  }

  /**
   * Push one household event to the given device targets. A no-op when no
   * transport is configured or there are no targets. Throws only on a retryable
   * transport error after the transport's own retries — the fan-out caller wraps
   * this so a push glitch never affects the committed in-app/email notifications.
   */
  async sendEvent(params: EventPushParams): Promise<void> {
    if (!this.transport || params.targets.length === 0) return;
    const messages: ExpoPushMessage[] = params.targets.map((t) => ({
      to: t.token,
      title: params.title,
      body: params.message,
      ...(params.data ? { data: params.data } : {}),
    }));
    await this.transport.send(messages);
  }
}
