"use client";

import { Bell } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { fetchNotifications, onUnreadChanged } from "./notification-client";

/**
 * Header notification bell with an unread badge (P8-3, design/09 § 7). The count
 * is server-rendered for the first paint (`initialUnreadCount`) and refreshed on
 * mount and whenever the tab regains focus, so navigating back or returning to
 * the app reflects new notifications without a full reload. (Supabase realtime is
 * the V2 upgrade path noted in design/09 § 7.)
 */
export function NotificationBell({
  initialUnreadCount,
}: {
  initialUnreadCount: number;
}) {
  const [unread, setUnread] = useState(initialUnreadCount);

  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      try {
        const inbox = await fetchNotifications({ unreadOnly: true, limit: 1 });
        if (!cancelled) setUnread(inbox.unreadCount);
      } catch {
        // Best-effort badge — keep the last known count on a transient failure.
      }
    };

    void refresh();
    window.addEventListener("focus", refresh);
    // Refetch the moment the inbox marks things read in the same tab (no focus
    // event fires for an in-tab navigation), so the badge never goes stale.
    const unsubscribe = onUnreadChanged(refresh);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", refresh);
      unsubscribe();
    };
  }, []);

  const label =
    unread > 0 ? `Notifications (${unread} unread)` : "Notifications";

  return (
    <Link
      href="/notifications"
      aria-label={label}
      className={cn(
        buttonVariants({ variant: "ghost", size: "icon" }),
        "relative",
      )}
    >
      <Bell />
      {unread > 0 && (
        <span
          aria-hidden
          className="absolute -top-0.5 -right-0.5 flex min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] leading-4 font-semibold text-primary-foreground"
        >
          {unread > 9 ? "9+" : unread}
        </span>
      )}
    </Link>
  );
}
