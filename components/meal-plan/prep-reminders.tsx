import type { PrepReminderDto } from "@/lib/services/prep/deadlines";

/**
 * Dashboard prep reminders (P7-5, design/08 § 11). A server component: it renders
 * the derived, deadline-sorted prep list with overdue items highlighted. Deadlines
 * are computed in UTC (the recommender's documented MVP simplification — no
 * household timezone yet), so the time is labelled UTC. Renders nothing when there
 * is no upcoming prep.
 */
export function PrepReminders({ items }: { items: PrepReminderDto[] }) {
  if (items.length === 0) return null;

  return (
    <section className="rounded-lg border bg-muted/30 p-4">
      <h2 className="font-heading text-sm font-semibold tracking-tight">
        Prep ahead
      </h2>
      <p className="mt-0.5 text-xs text-muted-foreground">
        Start these in time for upcoming meals.
      </p>
      <ul className="mt-3 space-y-2">
        {items.map((item) => (
          <li
            key={`${item.mealPlanItemId}-${item.taskName}`}
            className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 text-sm"
          >
            <span>
              <span className="font-medium">{item.taskName}</span>
              <span className="text-muted-foreground"> · {item.dishName}</span>
            </span>
            <span
              className={
                item.overdue
                  ? "text-xs font-medium text-destructive"
                  : "text-xs text-muted-foreground"
              }
            >
              {item.overdue ? "Overdue — was due " : "by "}
              {formatDeadline(item.prepDeadline)}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Format an ISO deadline as e.g. "Mon, May 25, 04:30 UTC". */
function formatDeadline(iso: string): string {
  const formatted = new Date(iso).toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "UTC",
  });
  return `${formatted} UTC`;
}
