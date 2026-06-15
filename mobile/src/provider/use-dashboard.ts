import { useQuery } from "@tanstack/react-query";

import type { ProviderDashboardDto } from "@mmp/shared/provider";

import { providerClient } from "./client";

/**
 * Owner dashboard hook (MP-C-060, the mobile twin of the web dashboard page, spec
 * §13.2). Reads the composed day-at-a-glance summary — today's menu state + cutoff and
 * today's batch census + email status — through the shared `ProviderApiClient` seam, so
 * the screen renders identically whether fed the live client or the fixture mock.
 */

export function dashboardQueryKey(providerId: string) {
  return ["provider-dashboard", providerId] as const;
}

export function useDashboard(providerId: string) {
  return useQuery<ProviderDashboardDto>({
    queryKey: dashboardQueryKey(providerId),
    queryFn: () => providerClient.getDashboard(providerId),
  });
}
