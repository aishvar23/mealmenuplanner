import {
  useQuery,
  useQueryClient,
  type UseQueryResult,
} from "@tanstack/react-query";
import { useState } from "react";

import {
  isApiError,
  listHouseholds,
  setActiveHousehold,
  setPreferredHousehold,
  type HouseholdSummary,
} from "@/api";

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

/**
 * Household switcher (M2-6, design/10 § 6). Lists the caller's households and
 * switches the active (currently-viewed) or preferred (default-on-login) pointer
 * via the BETA `PUT …/active` / `…/preferred` endpoints, seeding the refreshed
 * list straight into the shared cache so the daily-loop screens follow instantly.
 */
export function useHouseholdSwitcher() {
  const qc = useQueryClient();
  const query = useHouseholds();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async (
    householdId: string,
    fn: (id: string) => Promise<{ households: HouseholdSummary[] }>,
  ) => {
    setBusyId(householdId);
    setError(null);
    try {
      const { households } = await fn(householdId);
      qc.setQueryData(householdsQueryKey, households);
    } catch (e) {
      setError(
        isApiError(e) ? e.message : "Couldn't update your household selection.",
      );
    } finally {
      setBusyId(null);
    }
  };

  const list = query.data ?? [];
  return {
    households: list,
    activeId: list.find((h) => h.isActive)?.householdId ?? null,
    preferredId: list.find((h) => h.isPreferred)?.householdId ?? null,
    isLoading: query.isLoading,
    error: query.error ? "Couldn't load your households." : error,
    busyId,
    switchActive: (id: string) => run(id, setActiveHousehold),
    setPreferred: (id: string) => run(id, setPreferredHousehold),
  };
}
