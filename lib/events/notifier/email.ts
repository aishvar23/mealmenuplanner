import "server-only";

import { getEmailTransport, type EmailTransport } from "./email-transport";
import { renderInviteEmail, type InviteEmailParams } from "./invite-email";
import type { Channel, NotificationPayload, Notifier } from "./port";

/**
 * The email adapter (design/09 § 1, § 5). MVP uses email for exactly one event —
 * the invite (`member_invited`), addressed to the external invitee, not a
 * `notifications` row — so the real entry point is {@link EmailNotifier.sendInvite}.
 * The port's `send()` exists to satisfy the `Notifier` contract for V2 (when
 * per-recipient routing + recipient-email resolution arrive); it is not invoked
 * by the MVP router.
 */
export class EmailNotifier implements Notifier {
  readonly channel: Channel = "email";

  constructor(
    private readonly transport: EmailTransport | null = getEmailTransport(),
  ) {}

  /** True when a transport is configured (RESEND_API_KEY present). */
  get isConfigured(): boolean {
    return this.transport !== null;
  }

  /**
   * Port method. MVP routing never sends in-app rows to email (the only email is
   * the invite, which targets an external address — see {@link sendInvite}). A
   * V2 implementation resolves the recipient's email + channel preferences.
   */
  async send(payload: NotificationPayload): Promise<void> {
    void payload;
  }

  /**
   * Send the one-time invite email (design/09 § 5). A no-op when no transport is
   * configured (best-effort, design/09 § 9). Throws only on a retryable transport
   * error after the transport's own retries are exhausted — callers wrap this in
   * a best-effort guard so a failed email never fails invite creation.
   */
  async sendInvite(params: InviteEmailParams): Promise<void> {
    if (!this.transport) return;
    const { subject, html, text } = renderInviteEmail(params);
    await this.transport.send({ to: params.toEmail, subject, html, text });
  }
}
