import { useQuery, useQueryClient } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { invitesApi, isApiError } from "@/api";
import { useAuth } from "@/auth/context";
import { clearPendingInvite, setPendingInvite } from "@/auth/pending-invite";
import { Button } from "@/components/Button";
import { ErrorBanner, ErrorState, LoadingState } from "@/components/Feedback";
import { householdsQueryKey } from "@/household/use-household";
import { MEMBERSHIP_TYPE_LABELS, ROLE_LABELS } from "@/household/labels";

/**
 * Invite landing screen (M2-4, design/07 § 6). Reached via an invite link
 * (`…/invite/{token}`, or the `mmp://invite/{token}` deep link). Shows the public
 * preview, then accepts (creates membership → routes to Today) or declines.
 * Accepting needs a session; a signed-out visitor is sent to sign in first.
 */
export default function InviteScreen() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const { session } = useAuth();
  const qc = useQueryClient();

  const [busy, setBusy] = useState<"accept" | "decline" | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // We've arrived at the invite (possibly via the post-sign-in redirect), so the
  // parked token has served its purpose — drop it to avoid a stale redirect later.
  useEffect(() => {
    clearPendingInvite();
  }, []);

  const preview = useQuery({
    queryKey: ["invitePreview", token],
    queryFn: () => invitesApi.getInvitePreview(token),
    enabled: !!token,
  });

  if (preview.isLoading) return <LoadingState label="Loading invite…" />;
  if (preview.isError || !preview.data) {
    return (
      <ErrorState message="This invite is invalid, expired, or already used." />
    );
  }

  const p = preview.data;

  async function accept() {
    if (!session) {
      // Park the token so sign-in returns here instead of dropping us on Today.
      setPendingInvite(token);
      router.push("/(auth)/sign-in");
      return;
    }
    setBusy("accept");
    setActionError(null);
    try {
      await invitesApi.acceptInvite(token);
      await qc.invalidateQueries({ queryKey: householdsQueryKey });
      router.replace("/(tabs)/today");
    } catch (e) {
      setActionError(isApiError(e) ? e.message : "Couldn't accept the invite.");
      setBusy(null);
    }
  }

  async function decline() {
    setBusy("decline");
    setActionError(null);
    try {
      await invitesApi.declineInvite(token);
      router.replace(session ? "/(tabs)/today" : "/(auth)/sign-in");
    } catch (e) {
      setActionError(
        isApiError(e) ? e.message : "Couldn't decline the invite.",
      );
      setBusy(null);
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-white">
      <View className="flex-1 justify-center gap-5 px-8">
        <View className="gap-2">
          <Text className="text-2xl font-bold text-gray-900">
            Join {p.householdName}
          </Text>
          <Text className="text-base text-gray-500">
            {p.invitedBy ? `${p.invitedBy} invited you` : "You've been invited"}{" "}
            as a {ROLE_LABELS[p.role].toLowerCase()}
            {p.membershipType === "temporary_guest"
              ? ` (${MEMBERSHIP_TYPE_LABELS[p.membershipType].toLowerCase()})`
              : ""}
            .
          </Text>
        </View>

        {!session ? (
          <Text className="text-sm text-gray-400">
            Sign in or create an account to accept this invite.
          </Text>
        ) : null}

        {actionError ? <ErrorBanner message={actionError} /> : null}

        <View className="gap-3">
          <Button
            label={session ? "Accept invite" : "Sign in to accept"}
            loading={busy === "accept"}
            disabled={busy !== null}
            onPress={accept}
          />
          <Button
            label="Decline"
            variant="secondary"
            loading={busy === "decline"}
            disabled={busy !== null}
            onPress={decline}
          />
        </View>
      </View>
    </SafeAreaView>
  );
}
