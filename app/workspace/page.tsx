import { ChefHat, ChevronRight, Store } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";

import { getAuthUser } from "@/lib/auth";
import { listUserHouseholds } from "@/lib/services/household";
import {
  listProviderSummaries,
  resolveWorkspaceDiscovery,
} from "@/lib/services/workspace";
import type { WorkspaceRef } from "@/packages/shared/provider";

export const dynamic = "force-dynamic";

export const metadata = { title: "Choose a workspace" };

/**
 * Workspace chooser (MP-B-010, ADR-1). A user can belong to a household, own a
 * provider, and be a customer of others at once; this is where they pick which
 * one to enter. Rendered outside the `(app)` nav shell — a provider-only user has
 * no household, so the Today/Plan/etc. nav would go nowhere — and reached when the
 * `(app)` onboarding gate finds no household but live provider workspaces.
 *
 * Auth is gated by the edge proxy (`/workspace` is a protected prefix); this
 * server component re-resolves the verified user as a defense-in-depth backstop,
 * matching the `(app)` layout and the onboarding route.
 *
 * It lists every workspace with a link to its `defaultPath`. Auto-redirecting a
 * sole/active workspace is intentionally deferred until the provider shells
 * (#18) exist, so we never bounce a single-provider user to a not-yet-built page.
 * `WorkspaceRef` carries no display name, so names are joined in from the
 * household + provider summaries.
 */
export default async function WorkspacePage() {
  const user = await getAuthUser();
  if (!user) {
    redirect("/sign-in");
  }

  const [discovery, households, providers] = await Promise.all([
    resolveWorkspaceDiscovery(),
    listUserHouseholds(),
    listProviderSummaries(),
  ]);

  // A user who belongs to nothing yet is a brand-new household signup.
  if (discovery.workspaces.length === 0) {
    redirect("/onboarding");
  }

  const nameById = new Map<string, string>();
  for (const h of households) nameById.set(h.householdId, h.name);
  for (const p of providers) nameById.set(p.providerId, p.name);

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-canvas px-4 py-12 text-foreground">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <h1 className="font-heading text-2xl font-bold tracking-tight">
            Choose a workspace
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            You belong to more than one place. Pick where you want to go.
          </p>
        </div>

        <ul className="overflow-hidden rounded-xl border bg-background shadow-sm">
          {discovery.workspaces.map((ws) => (
            <li key={`${ws.type}:${ws.id}`}>
              <Link
                href={ws.defaultPath}
                className="flex items-center gap-3 border-b px-4 py-4 last:border-b-0 hover:bg-muted/50"
              >
                <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  {ws.type === "household" ? (
                    <ChefHat className="size-5" />
                  ) : (
                    <Store className="size-5" />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">
                    {nameById.get(ws.id) ?? workspaceTypeLabel(ws.type)}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {workspaceSubtitle(ws)}
                  </span>
                </span>
                <ChevronRight className="size-5 shrink-0 text-muted-foreground" />
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}

/** Human label for a workspace type, used when a name is unavailable. */
function workspaceTypeLabel(type: WorkspaceRef["type"]): string {
  switch (type) {
    case "household":
      return "Household";
    case "provider_owner":
      return "Your provider";
    case "provider_customer":
      return "Provider";
  }
}

/** The secondary line under a workspace: its role, plus a pending hint. */
function workspaceSubtitle(ws: WorkspaceRef): string {
  switch (ws.type) {
    case "household":
      return `Household · ${ws.role}`;
    case "provider_owner":
      return "Meal provider · owner";
    case "provider_customer":
      return ws.status === "active"
        ? "Meal provider · subscriber"
        : "Meal provider · awaiting approval";
  }
}
