import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type {
  CreateProviderInviteRequest,
  MemberDto,
} from "@mmp/shared/provider";

import { providerClient } from "./client";

/**
 * Provider member roster + lifecycle hooks (MP-C-022, the mobile twin of the web
 * Members page). Reads the roster through the shared `ProviderApiClient` seam and
 * runs approve/reject/remove + invite as mutations that invalidate the list, so a
 * single owner action refreshes the screen. TanStack Query dedupes the key.
 */

export function membersQueryKey(providerId: string) {
  return ["provider-members", providerId] as const;
}

export function useMembers(providerId: string) {
  return useQuery<MemberDto[]>({
    queryKey: membersQueryKey(providerId),
    queryFn: async () => (await providerClient.listMembers(providerId)).data,
  });
}

export function useMemberActions(providerId: string) {
  const queryClient = useQueryClient();
  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: membersQueryKey(providerId) });

  const approve = useMutation({
    mutationFn: (memberId: string) =>
      providerClient.approveMember(providerId, memberId),
    onSuccess: invalidate,
  });
  const reject = useMutation({
    mutationFn: (memberId: string) =>
      providerClient.rejectMember(providerId, memberId),
    onSuccess: invalidate,
  });
  const remove = useMutation({
    mutationFn: (memberId: string) =>
      providerClient.removeMember(providerId, memberId),
    onSuccess: invalidate,
  });
  const invite = useMutation({
    mutationFn: (input: CreateProviderInviteRequest) =>
      providerClient.createInvite(providerId, input),
  });

  return { approve, reject, remove, invite };
}
