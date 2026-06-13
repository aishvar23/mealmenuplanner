import { Redirect, type Href } from "expo-router";
import { ActivityIndicator, View } from "react-native";

import { useMyMembership } from "./use-my-membership";
import { useProviderMembership } from "./use-provider-membership";

/**
 * Gate a member menu screen on an *approved, onboarded* membership (MP-C-012/021,
 * the mobile twin of the web `requireActiveMember`). A non-member is sent to the
 * providers list; an awaiting-approval customer to the holding screen; an approved
 * customer who hasn't finished minimal onboarding to the onboarding screen (spec
 * §14.1/§14.4). Only an active, onboarded customer sees `children`.
 */
export function ActiveMemberGuard({
  providerId,
  children,
}: {
  providerId: string;
  children: React.ReactNode;
}) {
  const { membership, isLoading } = useProviderMembership(providerId);
  const { data: self, isLoading: selfLoading } = useMyMembership(providerId);

  if (isLoading || selfLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-gray-50">
        <ActivityIndicator size="large" color="#16a34a" />
      </View>
    );
  }
  if (!membership) {
    return <Redirect href="/(settings)/providers" />;
  }
  if (membership.membershipStatus !== "active") {
    return (
      <Redirect
        href={`/(provider-member)/${providerId}/awaiting-approval` as Href}
      />
    );
  }
  // Fail CLOSED on a missing/errored self-membership read: if we can't confirm
  // onboarding is complete, route to onboarding rather than letting the menu
  // render (matching the web `requireActiveMember`, which throws on this read).
  if (!self || !self.onboardingComplete) {
    return (
      <Redirect href={`/(provider-member)/${providerId}/onboarding` as Href} />
    );
  }
  return <>{children}</>;
}
