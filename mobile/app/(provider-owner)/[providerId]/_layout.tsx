import { Redirect, Tabs, useLocalSearchParams } from "expo-router";
import {
  CalendarRange,
  ClipboardList,
  LayoutDashboard,
  Soup,
  Users,
} from "lucide-react-native";
import { ActivityIndicator, View } from "react-native";

import { useAuth } from "@/auth/context";
import { useProviderMembership } from "@/provider/use-provider-membership";
import { WorkspaceSwitchButton } from "@/provider/workspace-switch-button";

function FullScreenSpinner() {
  return (
    <View className="flex-1 items-center justify-center bg-white">
      <ActivityIndicator size="large" color="#16a34a" />
    </View>
  );
}

/**
 * Provider owner shell (MP-C-011, the mobile twin of the web owner shell, spec
 * §13). A bottom-tab navigator — Dashboard, Responses, Menu, Members, Preparation
 * — scoped to one provider by the `[providerId]` segment. No household tabs. Lives
 * in its own route group, so a provider owner is never funneled through household
 * onboarding. Guards access: a signed-out user goes to sign-in, and a caller who
 * is not the owner of this provider is bounced to the providers list.
 */
export default function ProviderOwnerLayout() {
  const { providerId } = useLocalSearchParams<{ providerId: string }>();
  const { session, loading } = useAuth();

  if (loading) return <FullScreenSpinner />;
  if (!session) return <Redirect href="/(auth)/sign-in" />;

  return <GatedOwnerTabs providerId={providerId} />;
}

function GatedOwnerTabs({ providerId }: { providerId: string }) {
  const { membership, isLoading } = useProviderMembership(providerId);

  if (isLoading) return <FullScreenSpinner />;
  if (!membership || membership.role !== "owner") {
    return <Redirect href="/(settings)/providers" />;
  }

  return (
    <Tabs
      screenOptions={{
        headerShown: true,
        headerTitle: membership.name,
        headerRight: () => <WorkspaceSwitchButton />,
        tabBarActiveTintColor: "#16a34a",
        tabBarInactiveTintColor: "#6b7280",
      }}
    >
      <Tabs.Screen
        name="dashboard"
        options={{
          title: "Dashboard",
          tabBarIcon: ({ color, size }) => (
            <LayoutDashboard color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="responses"
        options={{
          title: "Responses",
          tabBarIcon: ({ color, size }) => (
            <ClipboardList color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="menu"
        options={{
          title: "Menu",
          tabBarIcon: ({ color, size }) => (
            <CalendarRange color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="members"
        options={{
          title: "Members",
          tabBarIcon: ({ color, size }) => <Users color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="preparation"
        options={{
          title: "Prep",
          tabBarIcon: ({ color, size }) => <Soup color={color} size={size} />,
        }}
      />
    </Tabs>
  );
}
