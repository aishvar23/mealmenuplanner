import type { EventType, EventVars, RenderedNotification } from "./types";

/**
 * Notification content templates (design/09 § 6). One template per event type,
 * rendered against an {@link EventVars} bag into a `{ title, message }` pair. The
 * verbatim spec examples (docs/09) are reproduced exactly for `meal_changed`,
 * `meal_marked_eating_out`, `invite_accepted`, and `prep_task_due`.
 *
 * Pure + client-safe so it is trivially unit-testable; an unknown event type
 * throws (design/09 § 6 — "fails fast in tests rather than shipping an empty
 * notification"). Output is plain text; the email adapter HTML-escapes its own
 * copy (the in-app client renders text).
 */

/** Capitalize a meal slot for a title ("dinner" → "Dinner"); fallback "Meal". */
function slotTitle(slot: string | undefined): string {
  if (!slot) return "Meal";
  return slot.charAt(0).toUpperCase() + slot.slice(1);
}

const TEMPLATES: Record<EventType, (v: EventVars) => RenderedNotification> = {
  meal_changed: (v) => ({
    title: `${slotTitle(v.slot)} changed`,
    message: `${v.actorName} changed ${v.slotLabel} from ${v.fromDish} to ${v.toDish}.`,
  }),
  meal_accepted: (v) => ({
    title: `${slotTitle(v.slot)} approved`,
    message: `${v.actorName} approved ${v.dish} for ${v.slotLabel}.`,
  }),
  meal_rejected: (v) => ({
    title: "Meal rejected",
    message: `${v.actorName} rejected ${v.dish} for ${v.slotLabel}.`,
  }),
  meal_marked_eating_out: (v) => ({
    title: "Meal marked as eating out",
    message: `${v.actorName} marked ${v.slotLabel} as eating out.`,
  }),
  meal_locked: (v) => ({
    title: `${slotTitle(v.slot)} locked`,
    message: `${v.actorName} locked ${v.slotLabel}.`,
  }),
  meal_unlocked: (v) => ({
    title: `${slotTitle(v.slot)} unlocked`,
    message: `${v.actorName} unlocked ${v.slotLabel}.`,
  }),
  weekly_plan_generated: (v) => ({
    title: "Weekly plan ready",
    message: `${v.actorName} generated a new weekly meal plan.`,
  }),
  weekly_plan_updated: (v) => ({
    title: "Weekly plan updated",
    message: `${v.actorName} updated the weekly meal plan.`,
  }),
  prep_task_due: (v) => ({
    title: "Prep needed",
    message: `${v.prepTaskName} by ${v.dueTime} for ${v.dish}.`,
  }),
  member_invited: (v) => ({
    title: "New invite sent",
    message: `${v.actorName} invited ${v.memberName} to ${v.householdName}.`,
  }),
  invite_accepted: (v) => ({
    title: "New household member",
    message: v.guestUntil
      ? `${v.memberName} joined ${v.householdName} as a guest until ${v.guestUntil}.`
      : `${v.memberName} joined ${v.householdName}.`,
  }),
  invite_declined: (v) => ({
    title: "Invite declined",
    message: `An invite to ${v.householdName} was declined.`,
  }),
  member_removed: (v) => ({
    title: "Member removed",
    message: `${v.actorName} removed ${v.memberName} from the household.`,
  }),
  member_left: (v) => ({
    title: "Member left",
    message: `${v.actorName} left the household.`,
  }),
  role_changed: (v) => ({
    title: "Role updated",
    message: `${v.actorName} changed ${v.memberName}'s role to ${v.newRole}.`,
  }),
  permissions_changed: (v) => ({
    title: "Access updated",
    message: `${v.actorName} updated ${v.memberName}'s access.`,
  }),
};

/** Render a notification's title + message for an event type (design/09 § 6). */
export function renderNotification(
  eventType: EventType,
  vars: EventVars,
): RenderedNotification {
  const template = TEMPLATES[eventType];
  if (!template) {
    throw new Error(`No notification template for event type: ${eventType}`);
  }
  return template(vars);
}
