import { useEffect, useRef } from "react";

import { useAuth } from "@/auth/context";

import { registerForPushNotifications } from "./push-registration";

/**
 * Registers this device for native push once a user is signed in (M3-3). Runs the
 * Expo-token fetch + upsert on the transition to a session, and re-runs if the
 * signed-in user changes (a shared device), so the token is owned by the current
 * user. Mounted app-wide via {@link PushRegistrar}.
 */
export function usePushRegistration(): void {
  const { session } = useAuth();
  const registeredForUser = useRef<string | null>(null);
  const userId = session?.user?.id ?? null;

  useEffect(() => {
    if (!userId) {
      registeredForUser.current = null;
      return;
    }
    if (registeredForUser.current === userId) return;
    registeredForUser.current = userId;
    void registerForPushNotifications();
  }, [userId]);
}

/** Null-rendering mount point so the registration hook runs under `AuthProvider`. */
export function PushRegistrar(): null {
  usePushRegistration();
  return null;
}
