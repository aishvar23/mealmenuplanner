import "server-only";

import { retryWithBackoff, type RetryOptions } from "./retry";

/**
 * The transactional email transport (design/02 § stack — Resend; design/09 § 5).
 * A thin port over the provider so the {@link EmailNotifier} stays
 * provider-agnostic. Sends are retried with bounded backoff; a non-2xx response
 * is a retryable transport error.
 */

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export interface EmailTransport {
  send(message: EmailMessage): Promise<void>;
}

const RESEND_ENDPOINT = "https://api.resend.com/emails";

/** Resend-backed transport. Retries the HTTP send with exponential backoff. */
export class ResendEmailTransport implements EmailTransport {
  constructor(
    private readonly apiKey: string,
    private readonly fromAddress: string,
    private readonly retryOptions: RetryOptions = {},
  ) {}

  async send(message: EmailMessage): Promise<void> {
    await retryWithBackoff(async () => {
      const response = await fetch(RESEND_ENDPOINT, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: this.fromAddress,
          to: message.to,
          subject: message.subject,
          html: message.html,
          text: message.text,
        }),
      });
      if (!response.ok) {
        // Body may carry the provider error detail; never logs the recipient.
        const detail = await response.text().catch(() => "");
        throw new Error(`Resend send failed (${response.status}): ${detail}`);
      }
    }, this.retryOptions);
  }
}

/**
 * Build the configured transport, or `null` when `RESEND_API_KEY` is unset
 * (local/dev, or before the provider is wired). A null transport makes the email
 * adapter a best-effort no-op rather than a hard failure — the invite is already
 * persisted and shareable via its link (design/09 § 9).
 */
export function getEmailTransport(): EmailTransport | null {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return null;
  const fromAddress =
    process.env.RESEND_FROM_EMAIL ??
    "Home Meal Planner <onboarding@resend.dev>";
  return new ResendEmailTransport(apiKey, fromAddress);
}
