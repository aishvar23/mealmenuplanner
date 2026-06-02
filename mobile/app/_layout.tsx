import "../global.css";

import { QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { AuthProvider } from "@/auth/context";
import { useAuthDeepLinks } from "@/auth/deep-link";
import { PushRegistrar } from "@/notifications/use-push-registration";
import { queryClient } from "@/query/client";

/**
 * Router root (design/10 § 5). Wires the app-wide providers — TanStack Query for
 * server state, the Supabase-backed auth session, and safe-area insets — around
 * the expo-router stack. Route groups (`(auth)`, `(tabs)`) handle the rest.
 */
export default function RootLayout() {
  // Sign in from magic-link / OAuth deep links arriving through the OS (M1-2).
  useAuthDeepLinks();

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <PushRegistrar />
        <SafeAreaProvider>
          <StatusBar style="auto" />
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="index" />
            <Stack.Screen name="(auth)" />
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="onboarding" />
            <Stack.Screen name="(household)" />
            <Stack.Screen name="(settings)" />
            <Stack.Screen name="invite/[token]" />
          </Stack>
        </SafeAreaProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
