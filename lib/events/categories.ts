import type { EventType } from "./types";

/**
 * Email-notification categories (P9). Each household event maps to exactly one
 * category; a user opts IN to email per category on the notification-settings
 * page (all OFF by default). In-app notifications are unaffected — the inbox
 * always shows every event. Pure + client-safe (no `server-only`, no I/O) so the
 * settings form can import the labels and the map can be unit-tested.
 *
 * `notification_email_preferences.event_category` stores these identifiers; the
 * `get_event_email_recipients` RPC filters on them.
 */
export const EMAIL_CATEGORIES = [
  "today_meal",
  "weekly_plan",
  "member_invited",
  "member_removed",
  "member_changes",
  "prep_reminders",
] as const;

export type EmailCategory = (typeof EMAIL_CATEGORIES)[number];

/**
 * Every {@link EventType} → its email category. Declared as a total
 * `Record<EventType, EmailCategory>` on purpose: adding an event to
 * `EVENT_TYPES` without giving it a category fails to compile, so the email
 * fan-out can never silently drop a new event.
 */
export const EVENT_CATEGORY: Record<EventType, EmailCategory> = {
  // A changed today / slot decision (a swap is "a new meal combination").
  meal_changed: "today_meal",
  meal_accepted: "today_meal",
  meal_rejected: "today_meal",
  meal_marked_eating_out: "today_meal",
  meal_locked: "today_meal",
  meal_unlocked: "today_meal",
  // The weekly plan as a whole.
  weekly_plan_generated: "weekly_plan",
  weekly_plan_updated: "weekly_plan",
  // Membership.
  member_invited: "member_invited",
  member_removed: "member_removed",
  invite_accepted: "member_changes",
  invite_declined: "member_changes",
  member_left: "member_changes",
  role_changed: "member_changes",
  permissions_changed: "member_changes",
  // System-actor (cron) event — see EMAIL_CATEGORY_OPTIONS note below.
  prep_task_due: "prep_reminders",
};

export function categoryForEvent(eventType: EventType): EmailCategory {
  return EVENT_CATEGORY[eventType];
}

/**
 * The categories shown as checkboxes on the settings page, in display order,
 * with their copy. This is a SUBSET of {@link EMAIL_CATEGORIES}: `prep_reminders`
 * is intentionally omitted because `prep_task_due` is emitted by the pg_cron
 * `prep_reminders` job (P7-6), not the request-path `safeEmitHouseholdEvent`
 * email fan-out — so a "prep reminders" email box would never send today. Left
 * out to avoid a dead toggle; the category still exists so the map stays total.
 */
export const EMAIL_CATEGORY_OPTIONS: ReadonlyArray<{
  category: EmailCategory;
  label: string;
  description: string;
}> = [
  {
    category: "today_meal",
    label: "Today's meal changes",
    description:
      "When someone changes today's meal — a swap, a new combination, eating out, or a lock.",
  },
  {
    category: "weekly_plan",
    label: "Weekly plan changes",
    description: "When the weekly plan is generated or updated.",
  },
  {
    category: "member_invited",
    label: "A member is invited",
    description: "When someone is invited to the household.",
  },
  {
    category: "member_removed",
    label: "A member is removed",
    description: "When a member is removed from the household.",
  },
  {
    category: "member_changes",
    label: "Other member updates",
    description:
      "When someone joins, leaves, or has their role or permissions changed.",
  },
];

/** The categories a user can actually toggle (derived from the UI options). */
export const SETTABLE_EMAIL_CATEGORIES: readonly EmailCategory[] =
  EMAIL_CATEGORY_OPTIONS.map((o) => o.category);

/** True when `value` is a category the settings page exposes. */
export function isSettableEmailCategory(value: string): value is EmailCategory {
  return (SETTABLE_EMAIL_CATEGORIES as readonly string[]).includes(value);
}
