import { useQuery, type UseQueryResult } from "@tanstack/react-query";

import type { MyProviderMembershipDto } from "@mmp/shared/provider";

import { providerClient } from "./client";

/**
 * The caller's own membership of a provider (MP-C-021), used by the onboarding
 * gate + screen: `onboardingComplete` drives the redirect, and the rest prefills
 * the form + decides whether the auto-accept consent toggle is shown.
 */
export function myMembershipQueryKey(providerId: string) {
  return ["provider-my-membership", providerId] as const;
}

export function useMyMembership(
  providerId: string,
): UseQueryResult<MyProviderMembershipDto> {
  return useQuery({
    queryKey: myMembershipQueryKey(providerId),
    queryFn: () => providerClient.getMyMembership(providerId),
  });
}
