import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useState } from "react";

import {
  isApiError,
  notificationsApi,
  type NotificationInbox,
  type NotificationItem,
} from "@/api";

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
    staleTime: 60_000,
  });

  const items: NotificationItem[] = query.data?.items ?? [];
  const unreadCount = query.data?.unreadCount ?? 0;

  // Optimistic mark-read: flip the one item's readAt and decrement the badge in
  // the cache instead of refetching the whole inbox on every tap (which caused a
  // request-per-tap storm + list flicker). Rolls back on error.
  const markReadMutation = useMutation({
    mutationFn: (id: string) => notificationsApi.markRead(id),
    onMutate: async (id: string) => {
      setBusyId(id);
      setActionError(null);
      await qc.cancelQueries({ queryKey: notificationsQueryKey });
      const previous = qc.getQueryData<NotificationInbox>(
        notificationsQueryKey,
      );
      if (previous) {
        qc.setQueryData<NotificationInbox>(notificationsQueryKey, {
          ...previous,
          unreadCount: Math.max(0, previous.unreadCount - 1),
          items: previous.items.map((n) =>
            n.id === id && !n.readAt
              ? { ...n, readAt: new Date().toISOString() }
              : n,
          ),
        });
      }
      return { previous };
    },
    onError: (e, _id, context) => {
      if (context?.previous) {
        qc.setQueryData(notificationsQueryKey, context.previous);
      }
      setActionError(errorMessage(e));
    },
    onSettled: () => setBusyId(null),
  });

  const markRead = useCallback(
    (id: string) => {
      const item = items.find((n) => n.id === id);
      if (item?.readAt) return; // already read — no-op
      markReadMutation.mutate(id);
    },
    [items, markReadMutation],
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
