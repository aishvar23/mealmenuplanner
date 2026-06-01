"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import type {
  NotificationDto,
  NotificationInbox,
} from "@/lib/services/notification";

import * as api from "./notification-client";

/**
 * In-app notification inbox (P8-3, design/09 § 7). Server-renders the first page,
 * then this client list handles mark-read (per item + all), and "Load more"
 * cursor pagination. Each item shows its title, message, and relative time;
 * unread items are visually distinguished and clear on click.
 */
export function NotificationList({
  initial,
  householdId,
}: {
  initial: NotificationInbox;
  /** When set, the inbox is scoped to this household (load-more + mark-all). */
  householdId?: string;
}) {
  const [items, setItems] = useState<NotificationDto[]>(initial.items);
  const [nextCursor, setNextCursor] = useState<string | null>(
    initial.nextCursor,
  );
  const [unreadCount, setUnreadCount] = useState<number>(initial.unreadCount);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function guard(fn: () => Promise<void>): Promise<void> {
    setPending(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setPending(false);
    }
  }

  const onMarkRead = (item: NotificationDto) => {
    if (item.readAt) return;
    return guard(async () => {
      const { readAt } = await api.markRead(item.id);
      setItems((prev) =>
        prev.map((n) => (n.id === item.id ? { ...n, readAt } : n)),
      );
      setUnreadCount((c) => Math.max(0, c - 1));
      // Keep the header bell badge in sync (it lives in the persistent shell).
      api.emitUnreadChanged();
    });
  };

  const onMarkAll = () =>
    guard(async () => {
      await api.markAllRead(householdId);
      const now = new Date().toISOString();
      setItems((prev) => prev.map((n) => ({ ...n, readAt: n.readAt ?? now })));
      setUnreadCount(0);
      api.emitUnreadChanged();
    });

  const onLoadMore = () =>
    guard(async () => {
      const page = await api.fetchNotifications({
        cursor: nextCursor,
        householdId,
      });
      setItems((prev) => [...prev, ...page.items]);
      setNextCursor(page.nextCursor);
      setUnreadCount(page.unreadCount);
    });

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {unreadCount > 0 ? `${unreadCount} unread` : "All caught up"}
        </p>
        {unreadCount > 0 && (
          <Button
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={onMarkAll}
          >
            Mark all read
          </Button>
        )}
      </div>

      {error && <p className="mt-2 text-sm text-destructive">{error}</p>}

      {items.length === 0 ? (
        <div className="mt-6 rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
          No notifications yet. Changes to your plan, grocery list, and
          household will show up here.
        </div>
      ) : (
        <ul className="mt-6 divide-y rounded-lg border">
          {items.map((item) => (
            <li
              key={item.id}
              className={
                item.readAt
                  ? "flex items-start gap-3 px-4 py-3"
                  : "flex items-start gap-3 bg-primary/5 px-4 py-3"
              }
            >
              <span
                aria-hidden
                className={
                  item.readAt
                    ? "mt-1.5 size-2 shrink-0 rounded-full bg-transparent"
                    : "mt-1.5 size-2 shrink-0 rounded-full bg-primary"
                }
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="truncate text-sm font-medium">{item.title}</p>
                  <time
                    className="shrink-0 text-xs text-muted-foreground tabular-nums"
                    dateTime={item.createdAt}
                  >
                    {formatRelativeTime(item.createdAt)}
                  </time>
                </div>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  {item.message}
                </p>
              </div>
              {!item.readAt && (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => onMarkRead(item)}
                  className="shrink-0 text-xs font-medium text-primary hover:underline disabled:opacity-50"
                >
                  Mark read
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {nextCursor && (
        <div className="mt-4 flex justify-center">
          <Button
            variant="ghost"
            size="sm"
            disabled={pending}
            onClick={onLoadMore}
          >
            {pending ? "Loading…" : "Load more"}
          </Button>
        </div>
      )}
    </div>
  );
}

/** Compact relative time ("just now", "5m", "3h", "2d", else a short date). */
function formatRelativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  const diffMs = Date.now() - then;
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}
