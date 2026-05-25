"use client";

import { Menu } from "@base-ui/react/menu";
import { LogOut, Settings } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

/**
 * Account dropdown anchored to the header avatar. Rendered in both the mobile
 * and desktop headers of the app shell, so it's the one reliably-reachable place
 * to sign out on every viewport.
 *
 * "Sign out" posts to `POST /auth/sign-out` (which revokes the session and
 * clears the auth cookies server-side), then does a FULL navigation to
 * `/sign-in` — mirroring the dev/Google sign-in components — so the edge proxy
 * and server layouts re-resolve with no session and there's no stale-auth window.
 */
export function AccountMenu({
  email,
  initial,
}: {
  email: string | null;
  initial: string;
}) {
  const [pending, setPending] = useState(false);

  async function signOut() {
    setPending(true);
    try {
      await fetch("/auth/sign-out", { method: "POST" });
    } catch {
      // The session is cleared server-side regardless; fall through to navigate.
    }
    window.location.assign("/sign-in");
  }

  return (
    <Menu.Root>
      <Menu.Trigger
        aria-label={email ? `Account menu for ${email}` : "Account menu"}
        className="flex size-10 items-center justify-center rounded-lg border border-border bg-card text-sm font-bold text-primary shadow-xs transition-colors outline-none hover:border-primary/30 hover:bg-primary/5 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30 aria-expanded:border-primary/30 aria-expanded:bg-primary/5"
      >
        {initial}
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner
          side="bottom"
          align="end"
          sideOffset={8}
          className="z-50"
        >
          <Menu.Popup className="min-w-56 rounded-lg border border-border bg-card p-1.5 text-card-foreground shadow-lg shadow-foreground/10 outline-none">
            <div className="px-2 py-1.5">
              <p className="text-xs font-semibold tracking-[0.16em] text-muted-foreground uppercase">
                Signed in as
              </p>
              <p
                className="mt-0.5 truncate text-sm font-medium"
                title={email ?? undefined}
              >
                {email ?? "your account"}
              </p>
            </div>
            <Menu.Separator className="my-1 h-px bg-border" />
            <Menu.Item
              render={<Link href="/household" />}
              className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-sm font-medium text-foreground outline-none select-none data-highlighted:bg-primary/10 data-highlighted:text-primary"
            >
              <Settings className="size-4" />
              Household &amp; preferences
            </Menu.Item>
            <Menu.Item
              closeOnClick={false}
              disabled={pending}
              onClick={signOut}
              className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-sm font-medium text-foreground outline-none select-none data-highlighted:bg-primary/10 data-highlighted:text-primary data-disabled:pointer-events-none data-disabled:opacity-50"
            >
              <LogOut className="size-4" />
              {pending ? "Signing out…" : "Sign out"}
            </Menu.Item>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}
