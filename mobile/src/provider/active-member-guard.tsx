import { Redirect, type Href } from "expo-router";
import { ActivityIndicator, View } from "react-native";

import { useProviderMembership } from "./use-provider-membership";

/**
 * Gate a member menu screen on an *approved* membership (MP-C-012, the mobile twin
 * of the web `requireActiveMember`). A non-member is sent to the providers list; an
 * awaiting-approval customer is sent to the holding screen (they have no menu
 * access yet, spec §14.4). Only an active customer sees `children`.
 */
export function ActiveMemberGuard({
  providerId,
  children,
}: {
  providerId: string;
  children: React.ReactNode;
}) {
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
  if (membership.membershipStatus !== "active") {
    return (
      <Redirect
        href={`/(provider-member)/${providerId}/awaiting-approval` as Href}
      />
    );
  }
  return <>{children}</>;
}
