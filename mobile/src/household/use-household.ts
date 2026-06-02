import { useQuery, type UseQueryResult } from "@tanstack/react-query";

import { listHouseholds, type HouseholdSummary } from "@/api";

/**
 * Active-household resolution (design/10 § 6). The daily-loop screens operate on
 * one household; the web resolves it server-side, so the mobile client fetches
 * the list once (TanStack Query dedupes the shared key) and derives the active
 * one: the `isActive` pointer, else the `isPreferred` default, else the first.
 * Switching households is M2; this read-only pick is enough for M1.
 */

export const householdsQueryKey = ["households"] as const;

export function useHouseholds(): UseQueryResult<HouseholdSummary[]> {
  return useQuery({
    queryKey: householdsQueryKey,
    queryFn: listHouseholds,
    staleTime: 5 * 60_000,
  });
}

function pickActive(list: HouseholdSummary[]): HouseholdSummary | null {
  return (
    list.find((h) => h.isActive) ??
    list.find((h) => h.isPreferred) ??
    list[0] ??
    null
  );
}

export interface ActiveHousehold {
  household: HouseholdSummary | null;
  /** True once loaded and the caller belongs to no household (onboarding needed). */
  hasNoHousehold: boolean;
  isLoading: boolean;
  error: unknown;
  refetch: () => void;
}

export function useActiveHousehold(): ActiveHousehold {
  const query = useHouseholds();
  return {
    household: query.data ? pickActive(query.data) : null,
    hasNoHousehold: query.isSuccess && query.data.length === 0,
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  };
}
