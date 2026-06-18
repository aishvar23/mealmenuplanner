import { Tabs, useLocalSearchParams } from "expo-router";
import {
  CalendarRange,
  ClipboardList,
  LayoutDashboard,
  Soup,
  UtensilsCrossed,
  Users,
} from "lucide-react-native";

import type { ProviderSummaryDto } from "@mmp/shared/provider";

import { ProviderShellGuard } from "@/provider/provider-shell-guard";
import { WorkspaceSwitchButton } from "@/provider/workspace-switch-button";

/**
 * Provider owner shell (MP-C-011, the mobile twin of the web owner shell, spec
 * §13). A bottom-tab navigator — Dashboard, Responses, Menu, Members, Preparation
 * — scoped to one provider by the `[providerId]` segment. No household tabs. Lives
 * in its own route group, so a provider owner is never funneled through household
 * onboarding. Access (signed-out → sign-in, non-owner → providers list) is the
 * shared `ProviderShellGuard`, with `requireOwner`.
 */
export default function ProviderOwnerLayout() {
  const { providerId } = useLocalSearchParams<{ providerId: string }>();

  return (
    <ProviderShellGuard providerId={providerId} requireOwner>
      {(membership) => <OwnerTabs membership={membership} />}
    </ProviderShellGuard>
  );
}

function OwnerTabs({ membership }: { membership: ProviderSummaryDto }) {
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
        name="catalog"
        options={{
          title: "Catalog",
          tabBarIcon: ({ color, size }) => (
            <UtensilsCrossed color={color} size={size} />
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
