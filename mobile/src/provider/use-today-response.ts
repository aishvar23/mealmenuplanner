import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type {
  MemberResponseDto,
  MenuDayDto,
  SaveProviderResponseRequest,
} from "@mmp/shared/provider";

import { providerClient } from "./client";

/**
 * Member Today's Menu + response data hooks (MP-C-040/041, the mobile twin of the
 * web `TodayResponseView`). Reads the published menu day + the caller's own
 * response through the shared `ProviderApiClient` seam and exposes save / confirm /
 * cancel as mutations that invalidate the response query, so a successful action
 * refreshes the screen. The server is authoritative (MP-A-130): it derives
 * quantities and enforces the cutoff/lock/version rules — these hooks only carry
 * the contract body. TanStack Query dedupes the keys.
 */

export function todayMenuQueryKey(providerId: string) {
  return ["provider-today-menu", providerId] as const;
}

export function myResponseQueryKey(menuDayId: string) {
  return ["provider-my-response", menuDayId] as const;
}

export function useTodayResponse(providerId: string) {
  const queryClient = useQueryClient();

  const menuQuery = useQuery<MenuDayDto | null>({
    queryKey: todayMenuQueryKey(providerId),
    queryFn: () => providerClient.getTodayMenu(providerId),
  });
  const menuDayId = menuQuery.data?.menuDayId ?? null;

  const responseQuery = useQuery<MemberResponseDto>({
    // Keyed on a stable placeholder until the menu resolves, then on the real day.
    queryKey: myResponseQueryKey(menuDayId ?? "pending"),
    queryFn: () => providerClient.getMyResponse(menuDayId as string),
    enabled: menuDayId !== null,
  });

  const invalidateResponse = () => {
    if (menuDayId) {
      void queryClient.invalidateQueries({
        queryKey: myResponseQueryKey(menuDayId),
      });
    }
  };

  const save = useMutation({
    mutationFn: (body: SaveProviderResponseRequest) =>
      providerClient.saveMyResponse(menuDayId as string, body),
    onSuccess: invalidateResponse,
  });
  const confirm = useMutation({
    mutationFn: (responseId: string) =>
      providerClient.confirmResponse(responseId),
    onSuccess: invalidateResponse,
  });
  const cancel = useMutation({
    mutationFn: (responseId: string) =>
      providerClient.cancelResponse(responseId),
    onSuccess: invalidateResponse,
  });

  return {
    menu: menuQuery.data ?? null,
    response: responseQuery.data,
    isLoading:
      menuQuery.isLoading || (menuDayId !== null && responseQuery.isLoading),
    error: menuQuery.error ?? responseQuery.error,
    refetchResponse: responseQuery.refetch,
    save,
    confirm,
    cancel,
  };
}
