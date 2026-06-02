import { Redirect } from "expo-router";
import { ActivityIndicator, View } from "react-native";

import { useAuth } from "@/auth/context";

/**
 * Auth gate. While the persisted session is resolving, show a spinner; then
 * route to the tabs (signed in) or the sign-in flow (signed out).
 */
export default function Index() {
  const { session, loading } = useAuth();

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-white">
        <ActivityIndicator size="large" color="#16a34a" />
      </View>
    );
  }

  return <Redirect href={session ? "/(tabs)/today" : "/(auth)/sign-in"} />;
}
