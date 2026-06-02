import "server-only";

import { retryWithBackoff, type RetryOptions } from "./retry";

/**
 * The Expo Push transport (design/10 § 7). A thin port over the Expo Push API so
 * the {@link ExpoPushNotifier} stays provider-agnostic. Sends are retried with
 * bounded backoff; a non-2xx response is a retryable transport error. Messages
 * are chunked to Expo's 100-per-request limit.
 */

export interface ExpoPushMessage {
  /** An Expo push token: `ExponentPushToken[…]`. */
  to: string;
  title: string;
  body: string;
  /** Optional structured payload for deep-linking on tap. */
  data?: Record<string, unknown>;
}

export interface ExpoPushTransport {
  send(messages: ExpoPushMessage[]): Promise<void>;
}

const EXPO_PUSH_ENDPOINT = "https://exp.host/--/api/v2/push/send";
const MAX_BATCH = 100;

/** Expo-Push-backed transport. Retries each HTTP batch with exponential backoff. */
export class HttpExpoPushTransport implements ExpoPushTransport {
  constructor(
    private readonly accessToken: string,
    private readonly retryOptions: RetryOptions = {},
  ) {}

  async send(messages: ExpoPushMessage[]): Promise<void> {
    for (let i = 0; i < messages.length; i += MAX_BATCH) {
      const batch = messages.slice(i, i + MAX_BATCH);
      await retryWithBackoff(async () => {
        const response = await fetch(EXPO_PUSH_ENDPOINT, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.accessToken}`,
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify(batch),
        });
        if (!response.ok) {
          const detail = await response.text().catch(() => "");
          throw new Error(
            `Expo push send failed (${response.status}): ${detail}`,
          );
        }
      }, this.retryOptions);
    }
  }
}

/**
 * Build the configured transport, or `null` when `EXPO_ACCESS_TOKEN` is unset
 * (local/dev/CI, or before push is wired). A null transport makes the push
 * adapter a best-effort no-op — email + in-app are unaffected (design/10 § 7).
 */
export function getExpoPushTransport(): ExpoPushTransport | null {
  const accessToken = process.env.EXPO_ACCESS_TOKEN;
  if (!accessToken) return null;
  return new HttpExpoPushTransport(accessToken);
}
