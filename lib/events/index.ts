// lib/events — activity-event writer + notification fan-out + channel adapters
// (design/09). The audit log and per-recipient notifications are written
// atomically by the `emit_household_event` RPC; the notifier port handles
// best-effort external delivery (email for invites in MVP).
export {
  EVENT_TYPES,
  type EmitEventInput,
  type EventType,
  type EventVars,
  type RenderedNotification,
} from "./types";
export { renderNotification } from "./templates";
export { actorDisplayName, formatShortDate, formatSlotLabel } from "./format";
export { emitHouseholdEvent, safeEmitHouseholdEvent } from "./emit";
export {
  type Channel,
  type Notifier,
  type NotificationPayload,
  type InviteEmailParams,
  EmailNotifier,
  NotifierRegistry,
  buildDefaultRegistry,
  getNotifierRegistry,
  sendInviteEmail,
  renderInviteEmail,
  retryWithBackoff,
} from "./notifier";
