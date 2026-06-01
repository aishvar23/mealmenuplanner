import { NotificationHouseholdPicker } from "@/components/notifications/notification-household-picker";
import { NotificationList } from "@/components/notifications/notification-list";
import { listUserHouseholds } from "@/lib/services/household";
import { listNotifications } from "@/lib/services/notification";

export const metadata = { title: "Notifications" };

// Resolves the session per request; never statically cached.
export const dynamic = "force-dynamic";

/**
 * Notifications inbox (P8-3, design/09 § 7). Loads the first page server-side and
 * hands it to the interactive list (mark-read, mark-all, load more). The inbox is
 * recipient-scoped by RLS — every signed-in user sees only their own. A
 * multi-household user can filter to one household via `?householdId=` (BETA);
 * the default ("All households") shows every household's notifications.
 */
export default async function NotificationsPage({
  searchParams,
}: {
  searchParams: Promise<{ householdId?: string }>;
}) {
  const { householdId: requested } = await searchParams;
  const households = await listUserHouseholds();

  // Only honour a household the caller actually belongs to; otherwise show all.
  const selected =
    requested && households.some((h) => h.householdId === requested)
      ? requested
      : "all";

  const inbox = await listNotifications({
    householdId: selected === "all" ? undefined : selected,
  });

  return (
    <section className="mx-auto w-full max-w-3xl px-4 py-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-semibold tracking-tight">
            Notifications
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Menu changes, member updates, and prep reminders.
          </p>
        </div>
        {households.length > 1 ? (
          <NotificationHouseholdPicker
            households={households}
            selected={selected}
            includeAll
          />
        ) : null}
      </div>

      <div className="mt-6">
        <NotificationList
          key={selected}
          initial={inbox}
          householdId={selected === "all" ? undefined : selected}
        />
      </div>
    </section>
  );
}
