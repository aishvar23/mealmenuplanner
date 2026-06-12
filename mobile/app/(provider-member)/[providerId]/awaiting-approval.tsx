import { Redirect, useLocalSearchParams, type Href } from "expo-router";
import { ActivityIndicator, View } from "react-native";

import { AwaitingApprovalScreen } from "@/provider/awaiting-approval-screen";
import { useProviderMembership } from "@/provider/use-provider-membership";

/**
 * Awaiting-approval holding route (MP-C-012, spec §14.4). Renders the holding
 * screen for an awaiting customer; an already-approved customer who reaches this
 * URL is sent on to their Today's Menu, and a non-member to the providers list —
 * so the screen always reflects the member's true state.
 */
export default function MemberAwaitingApprovalScreen() {
  const { providerId } = useLocalSearchParams<{ providerId: string }>();
  const { membership, isLoading } = useProviderMembership(providerId);

  if (isLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-gray-50">
        <ActivityIndicator size="large" color="#16a34a" />
      </View>
    );
  }
  if (!membership) {
    return <Redirect href="/(settings)/providers" />;
  }
  if (membership.membershipStatus === "active") {
    return <Redirect href={`/(provider-member)/${providerId}/today` as Href} />;
  }
  return <AwaitingApprovalScreen providerName={membership.name} />;
}
