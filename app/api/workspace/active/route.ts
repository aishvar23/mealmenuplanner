import { ValidationError, withErrorBoundary } from "@/lib/errors";
import { readJsonObject } from "@/lib/http";
import { setActiveWorkspace } from "@/lib/services/workspace";
import type { WorkspaceRef } from "@/packages/shared/provider";

// Resolves the session from cookies; never statically cached.
export const dynamic = "force-dynamic";

const WORKSPACE_TYPES: WorkspaceRef["type"][] = [
  "household",
  "provider_owner",
  "provider_customer",
];

function isWorkspaceType(value: unknown): value is WorkspaceRef["type"] {
  return (
    typeof value === "string" && (WORKSPACE_TYPES as string[]).includes(value)
  );
}

/**
 * `POST /api/workspace/active` — persist the caller's active-workspace pointer
 * (MP-B-012, ADR-1). The write counterpart of the resolver's read: the workspace
 * switcher (account menu) and the `/workspace` chooser POST here before navigating
 * so the next post-login resolution lands on the chosen workspace.
 *
 * Body: `{ type: WorkspaceRef["type"]; id: string }`. The service confirms the
 * target is one of the caller's own workspaces and the RPC re-verifies live
 * membership (raising 403 otherwise), so a forged id can never be stored. Returns
 * `204 No Content` — the client already knows where it is navigating.
 */
export const POST = withErrorBoundary(async (request: Request) => {
  const body = await readJsonObject(request);

  if (!isWorkspaceType(body.type)) {
    throw new ValidationError("A valid workspace type is required.", [
      { field: "type", rule: "enum" },
    ]);
  }
  if (typeof body.id !== "string" || body.id.length === 0) {
    throw new ValidationError("A workspace id is required.", [
      { field: "id", rule: "required" },
    ]);
  }

  await setActiveWorkspace(body.type, body.id);
  return new Response(null, { status: 204 });
});
