import { useQuery, type UseQueryResult } from "@tanstack/react-query";

import type { ProviderSummaryDto } from "@mmp/shared/provider";

import { providerClient } from "./client";

/**
 * Provider-workspace discovery (MP-C-000 foundation; pairs with the web resolver
 * consumption in MP-B-010). Lists the providers the caller belongs to via the
 * shared `ProviderApiClient` seam, so the same hook drives every provider entry
 * point whether fed fixtures or live `/api/providers` data. TanStack Query
 * dedupes the shared key across screens, matching the household pattern
 * (`useHouseholds`).
 */

export const providersQueryKey = ["providers"] as const;

export function useProviders(): UseQueryResult<ProviderSummaryDto[]> {
  return useQuery({
    queryKey: providersQueryKey,
    queryFn: () => providerClient.listProviders(),
    staleTime: 5 * 60_000,
  });
}
