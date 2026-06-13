import { Tabs, useLocalSearchParams } from "expo-router";
import {
  CalendarDays,
  CalendarRange,
  ClipboardList,
  User,
} from "lucide-react-native";

import type { ProviderSummaryDto } from "@mmp/shared/provider";

import { ProviderShellGuard } from "@/provider/provider-shell-guard";
import { WorkspaceSwitchButton } from "@/provider/workspace-switch-button";

/**
 * Provider member (customer) shell (MP-C-012, the mobile twin of the web member
 * shell, spec §14). A bottom-tab navigator — Today, Week, Responses, Account —
 * scoped to one provider by `[providerId]`, so a customer of several providers
 * never sees one provider's data inside another's workspace (§14.4): the
 * membership is resolved from the RLS-backed providers list, which only returns
 * providers this user belongs to. Access (signed-out → sign-in, non-member →
 * providers list) is the shared `ProviderShellGuard`.
 *
 * An awaiting-approval customer has no menu access yet, so the shell hides the tab
 * bar and the menu tabs and shows only the holding screen; the menu screens also
 * redirect awaiting members there (ActiveMemberGuard) so a direct deep link can't
 * bypass the hidden tabs.
 */
export default function ProviderMemberLayout() {
  const { providerId } = useLocalSearchParams<{ providerId: string }>();

  return (
    <ProviderShellGuard providerId={providerId}>
      {(membership) => <MemberTabs membership={membership} />}
    </ProviderShellGuard>
  );
}

function MemberTabs({ membership }: { membership: ProviderSummaryDto }) {
  const awaiting = membership.membershipStatus !== "active";
  // An awaiting customer sees no menu nav: hide the tab bar and the menu tabs,
  // leaving only the (href-less) awaiting-approval screen they were routed to.
  const menuTab = awaiting ? null : undefined;

  return (
    <Tabs
      screenOptions={{
        headerShown: true,
        headerTitle: membership.name,
        headerRight: () => <WorkspaceSwitchButton />,
        tabBarActiveTintColor: "#16a34a",
        tabBarInactiveTintColor: "#6b7280",
        tabBarStyle: awaiting ? { display: "none" } : undefined,
      }}
    >
      <Tabs.Screen
        name="today"
        options={{
          title: "Today",
          href: menuTab,
          tabBarIcon: ({ color, size }) => (
            <CalendarDays color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="week"
        options={{
          title: "Week",
          href: menuTab,
          tabBarIcon: ({ color, size }) => (
            <CalendarRange color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="responses"
        options={{
          title: "Responses",
          href: menuTab,
          tabBarIcon: ({ color, size }) => (
            <ClipboardList color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="account"
        options={{
          title: "Account",
          href: menuTab,
          tabBarIcon: ({ color, size }) => <User color={color} size={size} />,
        }}
      />
      <Tabs.Screen name="awaiting-approval" options={{ href: null }} />
      <Tabs.Screen name="onboarding" options={{ href: null }} />
    </Tabs>
  );
}
