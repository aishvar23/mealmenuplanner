import { useHouseholds } from "@/household/use-household";

import { useProviders } from "./use-providers";
import type { WorkspaceTarget } from "./use-workspace-switch";
import { providerWorkspaceRoute } from "./workspace-routes";

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

  const options: WorkspaceOption[] = [];

  for (const h of households.data ?? []) {
    options.push({
      type: "household",
      id: h.householdId,
      route: "/(tabs)/today",
      name: h.name,
      subtitle: `Household · ${h.role}`,
      kind: "household",
    });
  }

  for (const p of providers.data ?? []) {
    options.push({
      type: p.role === "owner" ? "provider_owner" : "provider_customer",
      id: p.providerId,
      route: providerWorkspaceRoute(p),
      name: p.name,
      subtitle:
        p.role === "owner"
          ? "Meal provider · owner"
          : p.membershipStatus === "active"
            ? "Meal provider · subscriber"
            : "Meal provider · awaiting approval",
      kind: "provider",
    });
  }

  return {
    options,
    isLoading: households.isLoading || providers.isLoading,
    isError: households.isError || providers.isError,
  };
}
