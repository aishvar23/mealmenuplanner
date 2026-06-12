import "server-only";

import { requireAuthUser } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/db/server";
import { ForbiddenError, InternalError, ValidationError } from "@/lib/errors";
import type { WorkspaceRef } from "@/packages/shared/provider";

import { resolveWorkspaces } from "./resolve";

/**
 * Persist the caller's active-workspace pointer (MP-A-015 / MP-B-012, ADR-1).
 *
 * The write side of `user_active_workspace`, deferred from the resolver (#17,
 * read-only) to the workspace switcher (#18). Routing reads the pointer to decide
 * which of a multi-workspace user's places to enter; switching workspaces (account
 * menu switcher, `/workspace` chooser) is the only thing that writes it.
 *
 * Two layers of authorization, defense-in-depth:
 *   1. here, we confirm the target is one of the caller's own enterable workspaces
 *      (`resolveWorkspaces`) so a request for an unknown/forged ref fails as a
 *      clean `FORBIDDEN` before touching the DB;
 *   2. the `set_active_workspace` RPC (SECURITY DEFINER) re-verifies live
 *      membership of the right type and raises `42501` otherwise — it is the
 *      authoritative gate, never bypassed by the client.
 */
export async function setActiveWorkspace(
  type: WorkspaceRef["type"],
  id: string,
): Promise<void> {
  await requireAuthUser();

  // App-layer guard: the target must be a workspace this user can actually enter.
  // The RPC re-checks; this just turns "not yours" into a 403 with a clear message
  // instead of leaning on the Postgres error mapping.
  const workspaces = await resolveWorkspaces();
  const belongs = workspaces.some((w) => w.type === type && w.id === id);
  if (!belongs) {
    throw new ForbiddenError("You are not a member of that workspace.");
  }

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.rpc("set_active_workspace", {
    p_workspace_type: type,
    p_workspace_id: id,
  });

  if (error) {
    // 42501 = insufficient_privilege (not a member); 22023 = invalid type.
    if (error.code === "42501") {
      throw new ForbiddenError("You are not a member of that workspace.");
    }
    if (error.code === "22023") {
      throw new ValidationError("Unknown workspace type.", [
        { field: "type", rule: "enum" },
      ]);
    }
    throw new InternalError("Failed to switch your active workspace.", {
      cause: error,
    });
  }
}
