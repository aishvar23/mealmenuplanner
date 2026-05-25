import { Clock3 } from "lucide-react";

import type { PrepReminderDto } from "@/lib/services/prep/deadlines";

/**
 * Dashboard prep reminders (P7-5, design/08 section 11). A server component: it
 * renders the derived, deadline-sorted prep list with overdue items highlighted.
 * Deadlines are computed in UTC for the MVP.
 */
export function PrepReminders({ items }: { items: PrepReminderDto[] }) {
  if (items.length === 0) return null;

  return (
    <section className="rounded-lg border bg-card p-4 shadow-xs">
      <div className="flex items-center gap-3">
        <span className="flex size-10 items-center justify-center rounded-lg bg-saffron text-saffron-foreground">
          <Clock3 className="size-5" />
        </span>
        <div>
          <h2 className="font-heading text-sm font-bold tracking-tight">
            Prep ahead
          </h2>
          <p className="text-xs text-muted-foreground">
            Start these in time for upcoming meals.
          </p>
        </div>
      </div>
      <ul className="mt-3 flex flex-col gap-2">
        {items.map((item) => (
          <li
            key={`${item.mealPlanItemId}-${item.taskName}`}
            className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 rounded-lg bg-background px-3 py-2 text-sm"
          >
            <span>
              <span className="font-semibold">{item.taskName}</span>
              <span className="text-muted-foreground"> / {item.dishName}</span>
            </span>
            <span
              className={
                item.overdue
                  ? "text-xs font-semibold text-destructive"
                  : "text-xs font-semibold text-muted-foreground"
              }
            >
              {item.overdue ? "Overdue - was due " : "by "}
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
