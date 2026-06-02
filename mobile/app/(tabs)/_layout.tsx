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

/**
 * Primary navigation (design/10 § 5): a bottom tab bar over Today / Week /
 * Grocery / Household / More. Guards the whole group — an unauthenticated user is
 * sent to the sign-in flow.
 */
export default function TabsLayout() {
  const { session, loading } = useAuth();

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-white">
        <ActivityIndicator size="large" color="#16a34a" />
      </View>
    );
  }
  if (!session) {
    return <Redirect href="/(auth)/sign-in" />;
  }

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
