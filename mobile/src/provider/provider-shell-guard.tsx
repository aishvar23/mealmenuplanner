import { Redirect } from "expo-router";
import type { ReactNode } from "react";
import { ActivityIndicator, View } from "react-native";

import type { ProviderSummaryDto } from "@mmp/shared/provider";

import { useAuth } from "@/auth/context";
import { useProviderMembership } from "@/provider/use-provider-membership";

/** Full-screen spinner shown while a provider shell resolves auth + membership. */
export function FullScreenSpinner() {
  return (
    <View className="flex-1 items-center justify-center bg-white">
      <ActivityIndicator size="large" color="#16a34a" />
    </View>
  );
}

/**
 * Shared access gate for both provider shells (MP-C-011/012), the mobile twin of
 * the web `requireMember` / owner guard. Resolves the session first, then — only
 * once authenticated, so a signed-out user never triggers the providers query —
 * the caller's membership of `providerId`. A spinner shows while either loads; a
 * signed-out user goes to sign-in, and a non-member (or, with `requireOwner`, a
 * non-owner) is bounced to the providers list. Only a caller who clears the gate
 * sees `children`, which receives the resolved membership so each shell can title
 * itself and branch on status without re-resolving it.
 */
export function ProviderShellGuard({
  providerId,
  requireOwner = false,
  children,
}: {
  providerId: string;
  requireOwner?: boolean;
  children: (membership: ProviderSummaryDto) => ReactNode;
}) {
  const { session, loading } = useAuth();

  if (loading) return <FullScreenSpinner />;
  if (!session) return <Redirect href="/(auth)/sign-in" />;

  return (
    <MembershipGate providerId={providerId} requireOwner={requireOwner}>
      {children}
    </MembershipGate>
  );
}

function MembershipGate({
  providerId,
  requireOwner,
  children,
}: {
  providerId: string;
  requireOwner: boolean;
  children: (membership: ProviderSummaryDto) => ReactNode;
}) {
  const { membership, isLoading } = useProviderMembership(providerId);

  if (isLoading) return <FullScreenSpinner />;
  if (!membership || (requireOwner && membership.role !== "owner")) {
    return <Redirect href="/(settings)/providers" />;
  }
  return <>{children(membership)}</>;
}
