import { Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

/**
 * Sign-in screen — placeholder shell. The real email/password, magic-link, and
 * Google OAuth flows land in M1-1 / M1-2 (design/10 § 3); this establishes the
 * route the auth gate redirects to.
 */
export default function SignInScreen() {
  return (
    <SafeAreaView className="flex-1 bg-white">
      <View className="flex-1 items-center justify-center px-8">
        <Text className="text-2xl font-bold text-gray-900">
          Home Meal Planner
        </Text>
        <Text className="mt-2 text-center text-base text-gray-500">
          Sign in coming in M1 — email, magic link, and Google.
        </Text>
      </View>
    </SafeAreaView>
  );
}
