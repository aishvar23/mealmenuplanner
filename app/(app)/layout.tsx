import { Bell } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { AppNav } from "@/components/app-nav";
import { buttonVariants } from "@/components/ui/button";

/**
 * Authenticated app shell (Today / Plan / Grocery / Household / Notifications).
 *
 * This is the visual shell only. Auth gating — resolving the session and
 * redirecting unauthenticated users to /sign-in — is added with the route
 * middleware in P1-3 (design/03 § 1).
 */
export default function AppLayout({ children }: { children: ReactNode }) {
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
            <Link
              href="/notifications"
              aria-label="Notifications"
              className={buttonVariants({ variant: "ghost", size: "icon" })}
            >
              <Bell />
            </Link>
            <div aria-hidden className="ml-1 size-7 rounded-full bg-muted" />
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
