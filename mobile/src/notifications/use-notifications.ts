import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useState } from "react";

import { isApiError, notificationsApi, type NotificationItem } from "@/api";

/**
 * Notifications inbox orchestration (M2-5, design/09 § 7). Loads the first page
 * of the inbox with its unread badge count and exposes mark-read / read-all; both
 * re-read the inbox on settle so the list + badge stay authoritative. Pagination
 * beyond the first page is deferred (inboxes are small in the MVP).
 */

const PAGE_SIZE = 50;
export const notificationsQueryKey = ["notifications"] as const;

export function useNotifications() {
  const qc = useQueryClient();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const query = useQuery({
    queryKey: notificationsQueryKey,
    queryFn: () => notificationsApi.listNotifications({ limit: PAGE_SIZE }),
  });

  const items: NotificationItem[] = query.data?.items ?? [];
  const unreadCount = query.data?.unreadCount ?? 0;

  const markRead = useCallback(
    async (id: string) => {
      const item = items.find((n) => n.id === id);
      if (item?.readAt) return; // already read — no-op
      setBusyId(id);
      setActionError(null);
      try {
        await notificationsApi.markRead(id);
        await qc.invalidateQueries({ queryKey: notificationsQueryKey });
      } catch (e) {
        setActionError(errorMessage(e));
      } finally {
        setBusyId(null);
      }
    },
    [items, qc],
  );

  const readAll = useMutation({
    mutationFn: () => notificationsApi.markAllRead(),
    onSuccess: () => qc.invalidateQueries({ queryKey: notificationsQueryKey }),
    onError: (e) => setActionError(errorMessage(e)),
  });

  return {
    items,
    unreadCount,
    isLoading: query.isLoading,
    error: query.error,
    refreshing: query.isRefetching,
    refetch: () => void query.refetch(),
    busyId,
    actionError,
    markRead,
    markAllRead: () => readAll.mutate(),
    markingAll: readAll.isPending,
  };
}

/** Lightweight unread-count read for the More tab badge (shares the inbox cache). */
export function useUnreadCount(): number {
  const query = useQuery({
    queryKey: notificationsQueryKey,
    queryFn: () => notificationsApi.listNotifications({ limit: PAGE_SIZE }),
    staleTime: 60_000,
  });
  return query.data?.unreadCount ?? 0;
}

function errorMessage(e: unknown): string {
  if (isApiError(e)) return e.message;
  return "Something went wrong. Please try again.";
}
