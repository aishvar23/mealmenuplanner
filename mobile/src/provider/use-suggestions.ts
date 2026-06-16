import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { ProviderSuggestionDto } from "@mmp/shared/provider";

import { providerClient } from "./client";

/**
 * Provider meal-suggestion data hook (MP-A-131, the mobile twin of the web
 * `MemberSuggestions` / `OwnerDaySuggestions` fetch helpers). Reads the day's
 * suggestions through the shared `ProviderApiClient` seam — RLS-scoped so a MEMBER
 * sees only their own (their status view) and the OWNER sees all (the triage list) —
 * and exposes create / accept / reject as mutations that invalidate the list, so a
 * successful action refreshes the screen. Suggestions never touch a response or batch
 * (BR-012). `enabled` gates the read so the owner's collapsible panel only fetches on
 * first expand. TanStack Query dedupes the keys.
 */

export function suggestionsQueryKey(menuDayId: string) {
  return ["provider-suggestions", menuDayId] as const;
}

export function useSuggestions(menuDayId: string, enabled = true) {
  const queryClient = useQueryClient();

  const list = useQuery<ProviderSuggestionDto[]>({
    queryKey: suggestionsQueryKey(menuDayId),
    queryFn: () => providerClient.listSuggestions(menuDayId),
    enabled,
  });

  const invalidate = () =>
    queryClient.invalidateQueries({
      queryKey: suggestionsQueryKey(menuDayId),
    });

  const create = useMutation({
    mutationFn: (suggestionText: string) =>
      providerClient.createSuggestion(menuDayId, { suggestionText }),
    onSuccess: invalidate,
  });

  const accept = useMutation({
    mutationFn: ({
      suggestionId,
      providerResponse,
    }: {
      suggestionId: string;
      providerResponse?: string;
    }) =>
      providerClient.acceptSuggestionAsOption(
        suggestionId,
        providerResponse ? { providerResponse } : undefined,
      ),
    onSuccess: invalidate,
  });

  const reject = useMutation({
    mutationFn: ({
      suggestionId,
      providerResponse,
    }: {
      suggestionId: string;
      providerResponse?: string;
    }) =>
      providerClient.rejectSuggestion(
        suggestionId,
        providerResponse ? { providerResponse } : undefined,
      ),
    onSuccess: invalidate,
  });

  return { list, create, accept, reject };
}
