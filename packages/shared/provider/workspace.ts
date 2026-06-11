// Provider Workspace — workspace reference model (contract 03 § 2).
//
// The discriminated union the workspace resolver (MP-A-100) returns and the
// post-login router (MP-B-010 / MP-C-010) consumes to decide where to send a
// user. An [EXTENSION] of the household `resolveCurrentHousehold` pattern that
// also accounts for provider owner / customer membership.

import type { ProviderMembershipStatus } from "./enums";

/**
 * One workspace a user can act in. `defaultPath` is the destination the router
 * sends the user to when this workspace is active (contract 03 § 2 / spec § 12.4):
 * household → `/today`; provider owner → `/provider/dashboard`; customer active →
 * `/providers/{id}/today`; customer awaiting → `/providers/{id}/awaiting-approval`.
 */
export type WorkspaceRef =
  | {
      type: "household";
      id: string;
      role: "owner" | "admin" | "member" | "viewer";
      defaultPath: string;
    }
  | { type: "provider_owner"; id: string; role: "owner"; defaultPath: string }
  | {
      type: "provider_customer";
      id: string;
      role: "customer";
      status: ProviderMembershipStatus;
      defaultPath: string;
    };

/** The set of workspaces a user belongs to plus which one is currently active. */
export interface WorkspaceDiscovery {
  workspaces: WorkspaceRef[];
  activeWorkspace: { type: WorkspaceRef["type"]; id: string } | null;
}
