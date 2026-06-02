import {
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from "react-native";

import type { NotificationItem } from "@/api";
import {
  EmptyState,
  ErrorBanner,
  ErrorState,
  LoadingState,
} from "@/components/Feedback";
import { useNotifications } from "@/notifications/use-notifications";

/**
 * Notifications inbox (M2-5, design/09 § 7). Lists the caller's notifications
 * across households; tapping an unread one marks it read, and "Mark all read"
 * clears the badge. Read items dim; unread carry a dot.
 */
export default function NotificationsScreen() {
  const n = useNotifications();

  if (n.isLoading) return <LoadingState />;
  if (n.error) {
    return (
      <ErrorState message="Couldn't load notifications." onRetry={n.refetch} />
    );
  }

  return (
    <View className="flex-1 bg-gray-50">
      <ScrollView
        contentContainerClassName="gap-3 p-4"
        refreshControl={
          <RefreshControl refreshing={n.refreshing} onRefresh={n.refetch} />
        }
      >
        {n.actionError ? <ErrorBanner message={n.actionError} /> : null}

        {n.unreadCount > 0 ? (
          <View className="flex-row items-center justify-between">
            <Text className="text-sm text-gray-500">
              {n.unreadCount} unread
            </Text>
            <Pressable
              accessibilityRole="button"
              onPress={n.markAllRead}
              disabled={n.markingAll}
              hitSlop={6}
            >
              <Text className="text-sm font-semibold text-green-700">
                Mark all read
              </Text>
            </Pressable>
          </View>
        ) : null}

        {n.items.length === 0 ? (
          <View className="mt-16">
            <EmptyState
              title="You're all caught up"
              hint="Notifications about your household's meals and members show up here."
            />
          </View>
        ) : (
          <View className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
            {n.items.map((item, i) => (
              <NotificationRow
                key={item.id}
                item={item}
                busy={n.busyId === item.id}
                isLast={i === n.items.length - 1}
                onPress={() => n.markRead(item.id)}
              />
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

function NotificationRow({
  item,
  busy,
  isLast,
  onPress,
}: {
  item: NotificationItem;
  busy: boolean;
  isLast: boolean;
  onPress: () => void;
}) {
  const unread = item.readAt === null;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={!unread || busy}
      className={`flex-row gap-3 px-4 py-3 ${isLast ? "" : "border-b border-gray-100"} ${unread ? "active:bg-gray-50" : ""} ${busy ? "opacity-50" : ""}`}
    >
      <View className="pt-1.5">
        <View
          className={`h-2 w-2 rounded-full ${unread ? "bg-green-600" : "bg-transparent"}`}
        />
      </View>
      <View className="flex-1">
        <Text
          className={`text-base ${unread ? "font-semibold text-gray-900" : "text-gray-500"}`}
        >
          {item.title}
        </Text>
        <Text
          className={`text-sm ${unread ? "text-gray-600" : "text-gray-400"}`}
        >
          {item.message}
        </Text>
        <Text className="mt-1 text-xs text-gray-400">
          {timeAgo(item.createdAt)}
        </Text>
      </View>
    </Pressable>
  );
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.floor(ms / 60_000);
  if (min < 1) return "Just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const days = Math.floor(hr / 24);
  if (days < 7) return `${days}d ago`;
  return `${Math.floor(days / 7)}w ago`;
}
