import { NotificationList } from "@/components/notifications/notification-list";
import { listNotifications } from "@/lib/services/notification";

export const metadata = { title: "Notifications" };

// Resolves the session per request; never statically cached.
export const dynamic = "force-dynamic";

/**
 * Notifications inbox (P8-3, design/09 § 7). Loads the first page server-side and
 * hands it to the interactive list (mark-read, mark-all, load more). The inbox is
 * recipient-scoped by RLS — every signed-in user sees only their own.
 */
export default async function NotificationsPage() {
  const inbox = await listNotifications();

  return (
    <section className="mx-auto w-full max-w-3xl px-4 py-8">
      <div>
        <h1 className="font-heading text-2xl font-semibold tracking-tight">
          Notifications
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Menu changes, member updates, and prep reminders.
        </p>
      </div>

      <div className="mt-6">
        <NotificationList initial={inbox} />
      </div>
    </section>
  );
}
