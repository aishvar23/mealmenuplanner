import { Pressable, Text, View } from "react-native";

import { useAuth } from "@/auth/context";

/**
 * "More" tab — settings entry point. Profile, household switcher, and
 * notification settings land in M2-5 / M2-6; sign-out is wired now to exercise
 * the auth session end-to-end.
 */
export default function MoreScreen() {
  const { user, signOut } = useAuth();

  return (
    <View className="flex-1 bg-white px-6 pt-6">
      <Text className="text-sm tracking-wide text-gray-400 uppercase">
        Signed in as
      </Text>
      <Text className="mt-1 text-base font-medium text-gray-900">
        {user?.email ?? "—"}
      </Text>

      <Text className="mt-8 text-center text-sm text-gray-400">
        Profile, household switcher & settings coming in M2-6.
      </Text>

      <Pressable
        accessibilityRole="button"
        onPress={() => {
          void signOut();
        }}
        className="bg-brand mt-8 items-center rounded-xl py-3 active:opacity-80"
      >
        <Text className="text-brand-fg text-base font-semibold">Sign out</Text>
      </Pressable>
    </View>
  );
}
