import { router } from "expo-router";
import { Bell, ChevronRight, Mail } from "lucide-react-native";
import type { ReactNode } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";

import { useAuth } from "@/auth/context";
import { useUnreadCount } from "@/notifications/use-notifications";

/**
 * "More" tab — settings entry point. Notifications + email preferences (M2-5);
 * profile + household switcher land in M2-6. Sign-out ends the session.
 */
export default function MoreScreen() {
  const { user, signOut } = useAuth();
  const unread = useUnreadCount();

  return (
    <ScrollView
      className="flex-1 bg-gray-50"
      contentContainerClassName="gap-6 p-4"
    >
      <View>
        <Text className="text-xs tracking-wide text-gray-400 uppercase">
          Signed in as
        </Text>
        <Text className="mt-1 text-base font-medium text-gray-900">
          {user?.email ?? "—"}
        </Text>
      </View>

      <View className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
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
  badge,
  onPress,
  isLast,
}: {
  icon: ReactNode;
  label: string;
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
      <Text className="flex-1 text-base text-gray-900">{label}</Text>
      {badge ? (
        <View className="min-w-6 items-center rounded-full bg-green-600 px-2 py-0.5">
          <Text className="text-xs font-semibold text-white">{badge}</Text>
        </View>
      ) : null}
      <ChevronRight color="#9ca3af" size={20} />
    </Pressable>
  );
}
