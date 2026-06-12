import "server-only";

import { listUserHouseholds } from "@/lib/services/household";
import type { WorkspaceRef } from "@/packages/shared/provider";

import type { WorkspaceOption } from "@/components/workspace/workspace-switcher";

import { listProviderSummaries, resolveWorkspaceDiscovery } from "./resolve";

/**
 * Build the switcher's workspace options (MP-B-012). The resolver returns
 * `WorkspaceRef[]` + the active pointer but no display names, so this joins names
 * from the household + provider summaries (the same join the `/workspace` chooser
 * does) and flags the active one. Rendered by every shell's account menu so a user
 * who belongs to more than one place can jump between them from anywhere.
 *
 * Pure read; safe to call in any authenticated server layout. Returns at most one
 * entry per workspace, households first (the resolver's order), so a single-
 * workspace user yields a one-item list — callers hide the switcher then.
 */
export async function resolveWorkspaceOptions(): Promise<WorkspaceOption[]> {
  const [discovery, households, providers] = await Promise.all([
    resolveWorkspaceDiscovery(),
    listUserHouseholds(),
    listProviderSummaries(),
  ]);

  const nameById = new Map<string, string>();
  for (const h of households) nameById.set(h.householdId, h.name);
  for (const p of providers) nameById.set(p.providerId, p.name);

  const active = discovery.activeWorkspace;

  return discovery.workspaces.map((ws) => ({
    type: ws.type,
    id: ws.id,
    name: nameById.get(ws.id) ?? workspaceTypeLabel(ws.type),
    subtitle: workspaceSubtitle(ws),
    defaultPath: ws.defaultPath,
    isActive: active?.type === ws.type && active.id === ws.id,
  }));
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
