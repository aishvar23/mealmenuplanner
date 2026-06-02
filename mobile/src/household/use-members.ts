import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useState } from "react";

import {
  getHousehold,
  isApiError,
  listMembers,
  removeMember as removeMemberApi,
  updateMember as updateMemberApi,
  type Member,
  type UpdateMemberInput,
} from "@/api";
import { useAuth } from "@/auth/context";

/**
 * Household members orchestration (M2-2, design/10 § 6). Loads the roster and the
 * household read (for the caller's `can_remove_members` gate + own user id), and
 * exposes role/permission edits and member removal. Every mutation re-reads the
 * authoritative roster on settle; editing your own row can change your
 * permissions, so the household read is invalidated alongside it.
 */

export function useMembers(householdId: string) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [busyMemberId, setBusyMemberId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const householdQuery = useQuery({
    queryKey: ["household", householdId],
    queryFn: () => getHousehold(householdId),
    staleTime: 5 * 60_000,
  });

  const membersQuery = useQuery({
    queryKey: ["members", householdId],
    queryFn: () => listMembers(householdId),
  });

  const invalidate = useCallback(
    () =>
      Promise.all([
        qc.invalidateQueries({ queryKey: ["members", householdId] }),
        // Editing your own row can change your permissions/role.
        qc.invalidateQueries({ queryKey: ["household", householdId] }),
      ]),
    [qc, householdId],
  );

  const run = useCallback(
    async (memberId: string, fn: () => Promise<unknown>) => {
      setActionError(null);
      setBusyMemberId(memberId);
      try {
        await fn();
        await invalidate();
      } catch (e) {
        setActionError(errorMessage(e));
      } finally {
        setBusyMemberId(null);
      }
    },
    [invalidate],
  );

  const update = useMutation({
    mutationFn: ({
      memberId,
      input,
    }: {
      memberId: string;
      input: UpdateMemberInput;
    }) => updateMemberApi(householdId, memberId, input),
  });

  const permissions = householdQuery.data?.currentUserPermissions;
  const canManage = permissions?.canRemoveMembers ?? false;

  // Active first, then by join time; removed/expired/declined sink to the bottom.
  const members = (membersQuery.data ?? []).slice().sort(sortMembers);

  return {
    members,
    isLoading: householdQuery.isLoading || membersQuery.isLoading,
    error: householdQuery.error ?? membersQuery.error,
    refreshing: membersQuery.isRefetching,
    refetch: () => void membersQuery.refetch(),
    canManage,
    canEditPreferences: permissions?.canEditHouseholdPreferences ?? false,
    isOwner: permissions?.role === "owner",
    currentUserId: user?.id ?? null,
    busyMemberId,
    actionError,
    clearActionError: () => setActionError(null),
    updateMember: (memberId: string, input: UpdateMemberInput) =>
      run(memberId, () => update.mutateAsync({ memberId, input })),
    removeMember: (memberId: string) =>
      run(memberId, () => removeMemberApi(householdId, memberId)),
  };
}

const STATUS_RANK: Record<Member["status"], number> = {
  active: 0,
  invited: 1,
  expired: 2,
  declined: 3,
  left: 4,
  removed: 5,
};

function sortMembers(a: Member, b: Member): number {
  const byStatus = STATUS_RANK[a.status] - STATUS_RANK[b.status];
  if (byStatus !== 0) return byStatus;
  // Owner first within a status group, then by join time (nulls last).
  if (a.role === "owner" && b.role !== "owner") return -1;
  if (b.role === "owner" && a.role !== "owner") return 1;
  return (a.joinedAt ?? "").localeCompare(b.joinedAt ?? "");
}

function errorMessage(e: unknown): string {
  if (isApiError(e)) return e.message;
  return "Something went wrong. Please try again.";
}
