import { useRouter, type Href } from "expo-router";
import { useState } from "react";

import type { WorkspaceRef } from "@mmp/shared/provider";

import { setActiveWorkspace } from "@/api/workspace";

/** A switchable workspace destination (where to record + navigate). */
export interface WorkspaceTarget {
  type: WorkspaceRef["type"];
  id: string;
  route: string;
}

/**
 * Switch the active workspace, then navigate to it (MP-C-012, the mobile twin of
 * the web `useWorkspaceSwitch`). Records the pointer (`POST /api/workspace/active`)
 * so the choice persists across devices, then `router.replace`s to the
 * workspace's home so there's no back-stack of half-entered workspaces. A failed
 * POST still navigates: the destination re-verifies access, and the pointer is a
 * convenience, not an authorization gate.
 */
export function useWorkspaceSwitch() {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function switchTo(target: WorkspaceTarget) {
    setPending(true);
    try {
      await setActiveWorkspace(target.type, target.id);
    } catch {
      // Navigate regardless — the destination is the real gate.
    }
    router.replace(target.route as Href);
    setPending(false);
  }

  return { switchTo, pending };
}
