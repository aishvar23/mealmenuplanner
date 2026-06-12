"use client";

import { Menu } from "@base-ui/react/menu";
import { Bell, Home, LogOut, SlidersHorizontal, Users } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import {
  WorkspaceSwitcherSection,
  type WorkspaceOption,
} from "@/components/workspace/workspace-switcher";

/**
 * Account dropdown anchored to the header avatar. Rendered in both the mobile
 * and desktop headers of the app shell, so it's the one reliably-reachable place
 * to sign out on every viewport.
 *
 * "Sign out" posts to `POST /auth/sign-out` (which revokes the session and
 * clears the auth cookies server-side), then does a FULL navigation to
 * `/sign-in` — mirroring the dev/Google sign-in components — so the edge proxy
 * and server layouts re-resolve with no session and there's no stale-auth window.
 *
 * When the user belongs to more than one workspace (household + provider, or
 * several providers), `workspaces` carries the switcher options (MP-B-012) and a
 * "Switch workspace" section is rendered so they can jump between them from any
 * shell. A single-workspace user passes no options and sees no switcher.
 */
export function AccountMenu({
  email,
  initial,
  name,
  workspaces = [],
}: {
  email: string | null;
  initial: string;
  /** The member's full name (or email) shown beside the avatar in the header. */
  name: string;
  /** Switchable workspaces; the switcher renders only when there are 2+. */
  workspaces?: WorkspaceOption[];
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
        className="flex h-10 items-center gap-2 rounded-lg border border-border bg-card pr-3 pl-1.5 shadow-xs transition-colors outline-none hover:border-primary/30 hover:bg-primary/5 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30 aria-expanded:border-primary/30 aria-expanded:bg-primary/5"
      >
        <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-sm font-bold text-primary">
          {initial}
        </span>
        <span className="max-w-[12rem] truncate text-sm font-semibold text-foreground">
          {name}
        </span>
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
              render={<Link href="/preferences" />}
              className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-sm font-medium text-foreground outline-none select-none data-highlighted:bg-primary/10 data-highlighted:text-primary"
            >
              <SlidersHorizontal className="size-4" />
              Preferences
            </Menu.Item>
            <Menu.Item
              render={<Link href="/household" />}
              className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-sm font-medium text-foreground outline-none select-none data-highlighted:bg-primary/10 data-highlighted:text-primary"
            >
              <Users className="size-4" />
              Members
            </Menu.Item>
            <Menu.Item
              render={<Link href="/households" />}
              className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-sm font-medium text-foreground outline-none select-none data-highlighted:bg-primary/10 data-highlighted:text-primary"
            >
              <Home className="size-4" />
              Manage households
            </Menu.Item>
            <Menu.Item
              render={<Link href="/notifications/settings" />}
              className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-sm font-medium text-foreground outline-none select-none data-highlighted:bg-primary/10 data-highlighted:text-primary"
            >
              <Bell className="size-4" />
              Notification settings
            </Menu.Item>
            {workspaces.length > 1 ? (
              <WorkspaceSwitcherSection options={workspaces} />
            ) : null}
            <Menu.Separator className="my-1 h-px bg-border" />
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
