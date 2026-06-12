import type { ProviderSummaryDto } from "@mmp/shared/provider";

import { useProviders } from "./use-providers";

/**
 * The caller's membership of one provider (MP-C-012), resolved from the shared
 * `useProviders` discovery list. The provider shells use it to gate access (a
 * non-member resolves to `undefined`) and to branch the member shell on
 * awaiting-vs-active. Reuses the cached `["providers"]` query, so no extra fetch.
 */
export function useProviderMembership(providerId: string): {
  membership: ProviderSummaryDto | undefined;
  isLoading: boolean;
  isError: boolean;
} {
  const { data, isLoading, isError } = useProviders();
  return {
    membership: data?.find((p) => p.providerId === providerId),
    isLoading,
    isError,
  };
}
