/**
 * The settable email-notification categories shown on the settings screen, with
 * copy. Hand-authored mirror of the web's `EMAIL_CATEGORY_OPTIONS`
 * (`lib/events/categories.ts`) — `prep_reminders` is intentionally omitted (its
 * event is cron-emitted, not request-path, so the toggle would be dead). Keep in
 * lockstep with the web list.
 */
export const EMAIL_CATEGORY_OPTIONS: ReadonlyArray<{
  category: string;
  label: string;
  description: string;
}> = [
  {
    category: "today_meal",
    label: "Today's meal changes",
    description:
      "When someone changes today's meal — a swap, eating out, or a lock.",
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
      "When someone joins, leaves, or their role/permissions change.",
  },
];
