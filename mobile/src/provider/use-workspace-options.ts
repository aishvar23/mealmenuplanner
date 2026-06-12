import { providerWorkspaceSubtitle } from "@mmp/shared/provider";
import { useMemo } from "react";

import { useHouseholds } from "@/household/use-household";

import { useProviders } from "./use-providers";
import type { WorkspaceTarget } from "./use-workspace-switch";
import { providerWorkspaceTarget } from "./workspace-routes";

/** A switchable workspace with display fields for the switcher list. */
export interface WorkspaceOption extends WorkspaceTarget {
  name: string;
  subtitle: string;
  kind: "household" | "provider";
}

/**
 * Every workspace the caller can switch to (MP-C-012), the mobile twin of the web
 * `resolveWorkspaceOptions`: households (from `useHouseholds`) first, then
 * providers (from `useProviders`), each with its display name, subtitle, and
 * in-app route. Drives the cross-type workspace switcher. The two underlying
 * queries are already cached, so this composes them without extra fetches.
 */
export function useWorkspaceOptions(): {
  options: WorkspaceOption[];
  isLoading: boolean;
  isError: boolean;
} {
  const households = useHouseholds();
  const providers = useProviders();

  // Rebuild only when the underlying query data changes, so the switcher list
  // keeps a stable identity across unrelated re-renders (header, pending toggle).
  const options = useMemo<WorkspaceOption[]>(() => {
    const out: WorkspaceOption[] = [];

    for (const h of households.data ?? []) {
      out.push({
        type: "household",
        id: h.householdId,
        route: "/(tabs)/today",
        name: h.name,
        subtitle: `Household · ${h.role}`,
        kind: "household",
      });
    }

    for (const p of providers.data ?? []) {
      out.push({
        ...providerWorkspaceTarget(p),
        name: p.name,
        subtitle: providerWorkspaceSubtitle(p.role, p.membershipStatus),
        kind: "provider",
      });
    }

    return out;
  }, [households.data, providers.data]);

  return {
    options,
    isLoading: households.isLoading || providers.isLoading,
    isError: households.isError || providers.isError,
  };
}
