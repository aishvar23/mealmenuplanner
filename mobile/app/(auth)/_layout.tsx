import { Redirect, Stack } from "expo-router";

import { useAuth } from "@/auth/context";

/**
 * Auth stack — sign in / sign up / magic link (M1-1) and Google OAuth (M1-2).
 * If a session already exists, bounce straight to the app.
 */
export default function AuthLayout() {
  const { session, loading } = useAuth();

  if (!loading && session) {
    return <Redirect href="/(tabs)/today" />;
  }

  return <Stack screenOptions={{ headerShown: false }} />;
}
