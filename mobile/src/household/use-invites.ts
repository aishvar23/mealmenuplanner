import { useQuery } from "@tanstack/react-query";

import { getHousehold, invitesApi, type PendingInvite } from "@/api";

/**
 * Pending-invites read for the Household tab (M2-4). Lists the household's
 * outstanding invites (empty for a member without `can_invite_members`) and
 * surfaces the caller's invite permission so the tab can show/hide the inviter
 * controls. Create / revoke happen in the invite screen.
 */
export function usePendingInvites(householdId: string) {
  const householdQuery = useQuery({
    queryKey: ["household", householdId],
    queryFn: () => getHousehold(householdId),
    staleTime: 5 * 60_000,
  });

  const canInvite =
    householdQuery.data?.currentUserPermissions.canInviteMembers ?? false;

  const invitesQuery = useQuery({
    queryKey: ["invites", householdId],
    queryFn: () => invitesApi.listPendingInvites(householdId),
    enabled: canInvite,
  });

  const invites: PendingInvite[] = invitesQuery.data ?? [];

  return {
    invites,
    canInvite,
    isLoading: invitesQuery.isLoading && canInvite,
    refetch: () => void invitesQuery.refetch(),
  };
}
