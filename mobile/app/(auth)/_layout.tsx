import { Redirect, Stack } from "expo-router";

import { useAuth } from "@/auth/context";
import { peekPendingInvite } from "@/auth/pending-invite";

/**
 * Auth stack — sign in / sign up / magic link (M1-1) and Google OAuth (M1-2).
 * If a session already exists, bounce straight to the app — or back to a pending
 * invite the visitor was trying to accept before signing in (M2-4).
 */
export default function AuthLayout() {
  const { session, loading } = useAuth();

  if (!loading && session) {
    const inviteToken = peekPendingInvite();
    if (inviteToken) {
      return (
        <Redirect
          href={{ pathname: "/invite/[token]", params: { token: inviteToken } }}
        />
      );
    }
    return <Redirect href="/(tabs)/today" />;
  }

  return <Stack screenOptions={{ headerShown: false }} />;
}
