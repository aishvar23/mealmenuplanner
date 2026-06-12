import type { User } from "@supabase/supabase-js";
import { ChefHat } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { AppNav } from "@/components/app-nav";
import { AccountMenu } from "@/components/auth/account-menu";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { getAuthUser } from "@/lib/auth";
import { resolveCurrentHousehold } from "@/lib/services/household";
import { getUnreadNotificationCount } from "@/lib/services/notification";
import {
  resolveWorkspaceEntryPath,
  resolveWorkspaceOptions,
} from "@/lib/services/workspace";

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

  // Onboarding gate (workspace-aware, ADR-1 / MP-B-010 + MP-B-012): no active
  // household means this user has no household workspace. A provider-only user
  // (provider owner or customer, no household) must NOT be force-fed household
  // onboarding — route them by the entry rule (spec §12.3): a sole provider
  // workspace auto-enters, several with a valid active pointer go to it, otherwise
  // the chooser; only a user who belongs to nothing is a brand-new household
  // signup and goes to onboarding. Household users resolve a household here and
  // skip this branch entirely, so their flow is unchanged. The provider shells,
  // `/workspace`, and `/onboarding` all live outside this `(app)` group, so no loop.
  const current = await resolveCurrentHousehold();
  if (!current) {
    redirect(await resolveWorkspaceEntryPath());
  }

  // The badge count and switcher options are independent of each other and of the
  // redirect above, so fetch them together rather than in series. The badge is
  // best-effort — a notifications glitch must not break the shell. The switcher
  // options (MP-B-012) let a household user who also owns/subscribes to a provider
  // jump there; a household-only user gets a single-item list and no switcher.
  const [unreadCount, workspaces] = await Promise.all([
    getUnreadNotificationCount().catch(() => 0),
    resolveWorkspaceOptions(),
  ]);

  return (
    <div className="min-h-full flex-1 bg-canvas text-foreground">
      <header className="sticky top-0 z-30 border-b bg-background/90 backdrop-blur supports-[backdrop-filter]:bg-background/80 lg:hidden">
        <div className="flex h-16 items-center gap-3 px-4">
          <Link
            href="/today"
            className="flex min-w-0 items-center gap-2 font-heading font-bold tracking-tight"
          >
            <span className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
              <ChefHat className="size-5" />
            </span>
            <span className="truncate">Home Meal Planner</span>
          </Link>
          <div className="ml-auto flex items-center gap-2">
            <NotificationBell initialUnreadCount={unreadCount} />
            <AccountMenu
              email={user.email ?? null}
              initial={accountInitial(user)}
              name={accountName(user)}
              workspaces={workspaces}
            />
          </div>
        </div>
      </header>

      <div className="mx-auto flex min-h-dvh w-full max-w-[1500px]">
        <aside className="sticky top-0 hidden h-dvh w-72 shrink-0 flex-col border-r border-sidebar-border bg-sidebar px-4 py-5 text-sidebar-foreground lg:flex">
          <Link href="/today" className="flex items-center gap-3 px-2">
            <span className="flex size-11 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground shadow-sm">
              <ChefHat className="size-6" />
            </span>
            <span className="min-w-0">
              <span className="block truncate font-heading text-lg font-bold tracking-tight">
                Home Meal Planner
              </span>
              <span className="block truncate text-xs font-medium text-sidebar-foreground/50">
                Cook less chaos
              </span>
            </span>
          </Link>
          <div className="mt-8">
            <AppNav />
          </div>
          <div className="mt-auto rounded-lg border border-sidebar-border bg-sidebar-accent/40 p-3">
            <p className="text-xs font-semibold tracking-[0.16em] text-sidebar-foreground/50 uppercase">
              Household
            </p>
            <p className="mt-1 truncate text-sm font-semibold">
              {user.email ?? "Signed in"}
            </p>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="hidden h-16 items-center justify-end gap-2 px-6 lg:flex">
            <NotificationBell initialUnreadCount={unreadCount} />
            <AccountMenu
              email={user.email ?? null}
              initial={accountInitial(user)}
              name={accountName(user)}
              workspaces={workspaces}
            />
          </header>
          <main className="flex-1 pb-24 lg:pb-0">{children}</main>
        </div>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t bg-background/94 px-2 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] shadow-[0_-12px_28px_oklch(0_0_0/0.08)] backdrop-blur lg:hidden">
        <AppNav variant="mobile" />
      </div>
    </div>
  );
}

/** First letter of the member's name (or email) for the avatar placeholder. */
function accountInitial(user: User): string {
  return accountName(user).charAt(0).toUpperCase() || "?";
}

/** The member's full name for the header — falls back to the email when unset. */
function accountName(user: User): string {
  const meta = user.user_metadata as {
    full_name?: string;
    name?: string;
  };
  const source = meta.full_name ?? meta.name ?? user.email ?? "";
  return source.trim() || "Your account";
}
