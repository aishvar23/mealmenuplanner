import type { WorkspaceRef } from "@mmp/shared/provider";

import { apiRequest } from "./client";

/**
 * Persist the caller's active-workspace pointer (MP-C-012, the mobile twin of the
 * web `POST /api/workspace/active`). Recorded when entering or switching a
 * workspace so the choice carries across devices and the next post-login
 * resolution lands there. The route validates membership server-side; a 204 means
 * the pointer was stored.
 */
export function setActiveWorkspace(
  type: WorkspaceRef["type"],
  id: string,
): Promise<void> {
  return apiRequest<void>("/api/workspace/active", {
    method: "POST",
    body: { type, id },
  });
}
