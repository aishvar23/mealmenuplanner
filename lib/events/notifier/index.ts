// Notifier port + pluggable channel adapters (design/09 § 1, § 5).
export type { Channel, NotificationPayload, Notifier } from "./port";
export { createNoopNotifier } from "./noop";
export { EmailNotifier } from "./email";
export {
  ResendEmailTransport,
  getEmailTransport,
  type EmailMessage,
  type EmailTransport,
} from "./email-transport";
export {
  renderInviteEmail,
  type InviteEmailParams,
  type RenderedEmail,
} from "./invite-email";
export { retryWithBackoff, type RetryOptions } from "./retry";
export { escapeHtml } from "./html";
export {
  NotifierRegistry,
  buildDefaultRegistry,
  getNotifierRegistry,
} from "./registry";
export { sendInviteEmail } from "./router";
