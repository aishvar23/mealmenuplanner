import type { Json } from "@/lib/db/database.types";

/**
 * The event taxonomy (design/09 § 2). Every identifier is written verbatim into
 * `household_activity_events.event_type` and `notifications.event_type` (both
 * free-text columns, doc 01). System-actor events (`prep_task_due`) are produced
 * by their own cron job (P7-6 `prep_reminders`), not the user-driven emit path,
 * but their template lives here too so the renderer is exhaustive.
 *
 * Pure + client-safe (no `server-only`, no I/O) so the templates can be
 * unit-tested with plain fixtures.
 */
export const EVENT_TYPES = [
  // Meal / schedule events
  "meal_changed",
  "meal_accepted",
  "meal_rejected",
  "meal_marked_eating_out",
  "meal_locked",
  "meal_unlocked",
  "weekly_plan_generated",
  "weekly_plan_updated",
  // Prep events (system actor; produced by the prep_reminders job)
  "prep_task_due",
  // Household / membership events
  "member_invited",
  "invite_accepted",
  "invite_declined",
  "member_removed",
  "member_left",
  "role_changed",
  "permissions_changed",
] as const;

export type EventType = (typeof EVENT_TYPES)[number];

/**
 * The variable bag a template renders against (design/09 § 6). Every field is
 * optional because each event uses a different subset; the renderer reads only
 * the ones its template references. Variables are resolved once during fan-out so
 * each notification row is self-contained (no display-time joins).
 */
export interface EventVars {
  /** `users.display_name` of the actor (or a sensible fallback). */
  actorName?: string;
  /** Raw `meal_slot` ("dinner") — used to build slot-specific titles. */
  slot?: string;
  /** Rendered slot label ("tonight's dinner", "Saturday dinner"). */
  slotLabel?: string;
  /** Old / new dish names for a swap. */
  fromDish?: string | null;
  toDish?: string | null;
  /** The affected dish name (reject / prep). */
  dish?: string | null;
  /** Invited / affected member display name (or invited email). */
  memberName?: string;
  /** Household display name. */
  householdName?: string;
  /** Formatted guest expiry ("May 26") for `invite_accepted`. */
  guestUntil?: string | null;
  /** The new role for `role_changed`. */
  newRole?: string;
  /** Prep-task fields (system event). */
  prepTaskName?: string;
  dueTime?: string;
}

/**
 * One domain change to record + fan out. The writer renders `vars` into a
 * `{ title, message }` pair, writes one `household_activity_events` row, and
 * inserts one `notifications` row per recipient (active members minus the actor,
 * plus `extraRecipientIds`) — all atomically in `emit_household_event`.
 */
export interface EmitEventInput {
  householdId: string;
  eventType: EventType;
  /** Audit `entity_type` (e.g. "meal_plan_item", "household_member"). */
  entityType: string;
  /** Audit `entity_id` of the changed row, when there is one. */
  entityId?: string | null;
  /** Audit before / after snapshots (jsonb). */
  oldValue?: Json | null;
  newValue?: Json | null;
  /** Template variables (design/09 § 6). */
  vars: EventVars;
  /**
   * Recipients to notify beyond "active members minus actor" — the AFFECTED
   * member who is not the actor (the removed member; whose role/permissions
   * changed). design/09 § 2 recipient note, § 4 step 5.
   */
  extraRecipientIds?: string[];
}

/** The rendered, ready-to-persist notification text. */
export interface RenderedNotification {
  title: string;
  message: string;
}
