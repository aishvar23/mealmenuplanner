import type { Database } from "@/lib/db/database.types";

/**
 * `notification` service DTOs (design/09 § 7). snake_case row → camelCase payload,
 * the API translation boundary. The inbox envelope is the design/09 § 7 shape
 * (`items` / `unreadCount` / `nextCursor`) — a cursor-paginated list with the
 * badge count alongside, distinct from the generic `{ data, page }` collection.
 */

type NotificationRow = Pick<
  Database["public"]["Tables"]["notifications"]["Row"],
  | "id"
  | "household_id"
  | "actor_user_id"
  | "event_type"
  | "title"
  | "message"
  | "read_at"
  | "created_at"
>;

export interface NotificationDto {
  id: string;
  householdId: string;
  actorUserId: string | null;
  eventType: string;
  title: string;
  message: string;
  readAt: string | null;
  createdAt: string;
}

export interface NotificationInbox {
  items: NotificationDto[];
  unreadCount: number;
  nextCursor: string | null;
}

export function toNotificationDto(row: NotificationRow): NotificationDto {
  return {
    id: row.id,
    householdId: row.household_id,
    actorUserId: row.actor_user_id,
    eventType: row.event_type,
    title: row.title,
    message: row.message,
    readAt: row.read_at,
    createdAt: row.created_at,
  };
}
