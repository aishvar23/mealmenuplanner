import { Redirect, Tabs } from "expo-router";
import {
  CalendarDays,
  ChefHat,
  Home,
  ShoppingCart,
  Users,
} from "lucide-react-native";
import { ActivityIndicator, View } from "react-native";

import { useAuth } from "@/auth/context";
import { useActiveHousehold } from "@/household/use-household";

function FullScreenSpinner() {
  return (
    <View className="flex-1 items-center justify-center bg-white">
      <ActivityIndicator size="large" color="#16a34a" />
    </View>
  );
}

/**
 * Primary navigation (design/10 § 5): a bottom tab bar over Today / Week /
 * Grocery / Household / More. Guards the whole group — an unauthenticated user is
 * sent to the sign-in flow, and a signed-in user with no household yet is sent to
 * onboarding (M2-1) before any tab renders.
 */
export default function TabsLayout() {
  const { session, loading } = useAuth();

  if (loading) return <FullScreenSpinner />;
  if (!session) return <Redirect href="/(auth)/sign-in" />;

  // Session exists — resolve the household in a child so the hook only runs (and
  // only fetches) once we're past the auth gate (Rules of Hooks: no early-return
  // before the household query).
  return <GatedTabs />;
}

function GatedTabs() {
  const { hasNoHousehold, isLoading } = useActiveHousehold();

  // Only block on the first load (no cached list yet); a background refetch keeps
  // the last list so we don't flash the spinner or bounce to onboarding.
  if (isLoading) return <FullScreenSpinner />;
  if (hasNoHousehold) return <Redirect href="/onboarding" />;

  return (
    <Tabs
      screenOptions={{
        headerShown: true,
        tabBarActiveTintColor: "#16a34a",
        tabBarInactiveTintColor: "#6b7280",
      }}
    >
      <Tabs.Screen
        name="today"
        options={{
          title: "Today",
          tabBarIcon: ({ color, size }) => (
            <ChefHat color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="week"
        options={{
          title: "Week",
          tabBarIcon: ({ color, size }) => (
            <CalendarDays color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="grocery"
        options={{
          title: "Grocery",
          tabBarIcon: ({ color, size }) => (
            <ShoppingCart color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="household"
        options={{
          title: "Household",
          tabBarIcon: ({ color, size }) => <Users color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="more"
        options={{
          title: "More",
          tabBarIcon: ({ color, size }) => <Home color={color} size={size} />,
        }}
      />
    </Tabs>
  );
}
