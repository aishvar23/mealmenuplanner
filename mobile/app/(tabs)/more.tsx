import { router } from "expo-router";
import { Bell, ChevronRight, Mail, Store, Users } from "lucide-react-native";
import type { ReactNode } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";

import { useAuth } from "@/auth/context";
import { useActiveHousehold } from "@/household/use-household";
import { useUnreadCount } from "@/notifications/use-notifications";

/**
 * "More" tab — profile, household switcher, notifications, and sign-out (M2-5 /
 * M2-6, design/10 § 6). Profile is read-only (no profile-edit endpoint yet).
 */
export default function MoreScreen() {
  const { user, signOut } = useAuth();
  const unread = useUnreadCount();
  const { household } = useActiveHousehold();
  const displayName =
    (user?.user_metadata?.full_name as string | undefined) ??
    (user?.user_metadata?.name as string | undefined) ??
    null;

  return (
    <ScrollView
      className="flex-1 bg-gray-50"
      contentContainerClassName="gap-6 p-4"
    >
      <View className="rounded-2xl border border-gray-200 bg-white p-4">
        <Text className="text-xs tracking-wide text-gray-400 uppercase">
          Signed in as
        </Text>
        {displayName ? (
          <Text className="mt-1 text-lg font-semibold text-gray-900">
            {displayName}
          </Text>
        ) : null}
        <Text
          className={`${displayName ? "text-sm text-gray-500" : "mt-1 text-base font-medium text-gray-900"}`}
        >
          {user?.email ?? "—"}
        </Text>
      </View>

      <View className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
        <Row
          icon={<Users color="#16a34a" size={20} />}
          label="Switch household"
          value={household?.name}
          onPress={() => router.push("/(settings)/households")}
        />
        <Row
          icon={<Store color="#16a34a" size={20} />}
          label="Meal providers"
          onPress={() => router.push("/(settings)/providers")}
        />
        <Row
          icon={<Bell color="#16a34a" size={20} />}
          label="Notifications"
          badge={
            unread > 0 ? (unread > 99 ? "99+" : String(unread)) : undefined
          }
          onPress={() => router.push("/(settings)/notifications")}
        />
        <Row
          icon={<Mail color="#16a34a" size={20} />}
          label="Email notifications"
          onPress={() => router.push("/(settings)/notification-settings")}
          isLast
        />
      </View>

      <Pressable
        accessibilityRole="button"
        onPress={() => void signOut()}
        className="items-center rounded-xl border border-gray-200 bg-white py-3.5 active:bg-gray-50"
      >
        <Text className="text-base font-semibold text-red-600">Sign out</Text>
      </Pressable>
    </ScrollView>
  );
}

function Row({
  icon,
  label,
  value,
  badge,
  onPress,
  isLast,
}: {
  icon: ReactNode;
  label: string;
  /** Optional trailing summary text (e.g. the current household name). */
  value?: string;
  badge?: string;
  onPress: () => void;
  isLast?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      className={`flex-row items-center gap-3 px-4 py-3.5 active:bg-gray-50 ${isLast ? "" : "border-b border-gray-100"}`}
    >
      {icon}
      <Text className="text-base text-gray-900">{label}</Text>
      <View className="flex-1" />
      {value ? (
        <Text className="max-w-[45%] text-sm text-gray-400" numberOfLines={1}>
          {value}
        </Text>
      ) : null}
      {badge ? (
        <View className="min-w-6 items-center rounded-full bg-green-600 px-2 py-0.5">
          <Text className="text-xs font-semibold text-white">{badge}</Text>
        </View>
      ) : null}
      <ChevronRight color="#9ca3af" size={20} />
    </Pressable>
  );
}
