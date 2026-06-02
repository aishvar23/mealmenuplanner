// `notification` service — the signed-in user's in-app inbox (design/09 § 7).
export {
  toNotificationDto,
  type NotificationDto,
  type NotificationInbox,
} from "./dto";
export { encodeCursor, decodeCursor, type NotificationCursor } from "./cursor";
export {
  listNotifications,
  getUnreadNotificationCount,
  DEFAULT_LIMIT,
  MAX_LIMIT,
  type ListNotificationsParams,
} from "./list";
export {
  markNotificationRead,
  markAllNotificationsRead,
  type MarkReadResult,
} from "./mark-read";
export {
  registerDeviceToken,
  type DevicePlatform,
  type RegisterDeviceTokenResult,
} from "./device-token";
