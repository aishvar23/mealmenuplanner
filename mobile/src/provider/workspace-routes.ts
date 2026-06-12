import type { ProviderSummaryDto } from "@mmp/shared/provider";

import type { WorkspaceTarget } from "./use-workspace-switch";

/**
 * In-app navigation targets for the provider workspace shells (MP-C-011/012), the
 * mobile counterpart of the web `defaultPath` in `WorkspaceRef` (spec §12.4). The
 * owner shell and the member shell are separate expo-router groups, each scoped by
 * `providerId` so a customer of several providers never crosses workspaces.
 */
export function providerWorkspaceRoute(provider: ProviderSummaryDto): string {
  if (provider.role === "owner") {
    return `/(provider-owner)/${provider.providerId}/dashboard`;
  }
  return provider.membershipStatus === "active"
    ? `/(provider-member)/${provider.providerId}/today`
    : `/(provider-member)/${provider.providerId}/awaiting-approval`;
}

/**
 * The full switch target (discriminator + id + route) for a provider, so the
 * providers list and the workspace switcher map a `ProviderSummaryDto` to a
 * `WorkspaceTarget` the same way — the role→workspace-type mapping lives here, not
 * inline at each call site.
 */
export function providerWorkspaceTarget(
  provider: ProviderSummaryDto,
): WorkspaceTarget {
  return {
    type: provider.role === "owner" ? "provider_owner" : "provider_customer",
    id: provider.providerId,
    route: providerWorkspaceRoute(provider),
  };
}
