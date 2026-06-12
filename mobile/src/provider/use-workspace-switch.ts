import { useQueryClient } from "@tanstack/react-query";
import { useRouter, type Href } from "expo-router";
import { useState } from "react";

import type { WorkspaceRef } from "@mmp/shared/provider";

import { setActiveHousehold } from "@/api";
import { setActiveWorkspace } from "@/api/workspace";
import { householdsQueryKey } from "@/household/use-household";

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
 *
 * Households carry a *second* pointer: the daily-loop tabs resolve which household
 * to show from the household-level `isActive` flag (`useActiveHousehold`), not the
 * workspace pointer. Switching to a household therefore also moves that flag (`PUT
 * /api/households/active`) and seeds the refreshed list into the shared cache, so
 * the tabs land on the chosen household instead of whichever was active before —
 * otherwise switching between two households would silently no-op on screen.
 *
 * `pending` is set while the switch is in flight and intentionally not reset: the
 * `router.replace` tears this screen down, so there is no mounted state to clear.
 */
export function useWorkspaceSwitch() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [pending, setPending] = useState(false);

  async function switchTo(target: WorkspaceTarget) {
    setPending(true);
    try {
      await setActiveWorkspace(target.type, target.id);
      if (target.type === "household") {
        const { households } = await setActiveHousehold(target.id);
        queryClient.setQueryData(householdsQueryKey, households);
      }
    } catch {
      // Navigate regardless — the destination is the real gate.
    }
    router.replace(target.route as Href);
  }

  return { switchTo, pending };
}
