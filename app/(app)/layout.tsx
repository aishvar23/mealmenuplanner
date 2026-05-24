import type { User } from "@supabase/supabase-js";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { AppNav } from "@/components/app-nav";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { getAuthUser } from "@/lib/auth";
import { getUnreadNotificationCount } from "@/lib/services/notification";

/**
 * Authenticated app shell (Today / Plan / Grocery / Household / Notifications).
 *
 * Auth is gated at two layers (design/03 § 1, § 3): the edge proxy (`proxy.ts`)
 * refreshes the session and redirects unauthenticated visitors to /sign-in
 * before the request reaches here, and this server component re-resolves the
 * verified user as a defense-in-depth backstop (and to render member-specific
 * UI). Nothing in the shell trusts the cookie without `getAuthUser()`.
 */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await getAuthUser();
  if (!user) {
    redirect("/sign-in");
  }

  // Best-effort badge count — a notifications glitch must not break the shell.
  let unreadCount = 0;
  try {
    unreadCount = await getUnreadNotificationCount();
  } catch {
    unreadCount = 0;
  }

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="sticky top-0 z-20 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-3 px-4">
          <Link
            href="/today"
            className="font-heading font-semibold tracking-tight"
          >
            Home Meal Planner
          </Link>
          <div className="ml-2 hidden sm:block">
            <AppNav />
          </div>
          <div className="ml-auto flex items-center gap-1">
            <NotificationBell initialUnreadCount={unreadCount} />
            <div
              className="ml-1 flex size-7 items-center justify-center rounded-full bg-primary/10 text-xs font-medium text-primary"
              title={user.email ?? undefined}
              aria-label={`Signed in as ${user.email ?? "your account"}`}
            >
              {accountInitial(user)}
            </div>
          </div>
        </div>
        {/* Stacked nav on small screens. */}
        <div className="overflow-x-auto border-t px-2 py-1.5 sm:hidden">
          <AppNav />
        </div>
      </header>
      <main className="flex-1">{children}</main>
    </div>
  );
}

/** First letter of the member's name (or email) for the avatar placeholder. */
function accountInitial(user: User): string {
  const meta = user.user_metadata as {
    full_name?: string;
    name?: string;
  };
  const source = meta.full_name ?? meta.name ?? user.email ?? "";
  return source.trim().charAt(0).toUpperCase() || "?";
}
