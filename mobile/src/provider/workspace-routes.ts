import type { ProviderSummaryDto } from "@mmp/shared/provider";

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
