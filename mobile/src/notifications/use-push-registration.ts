import * as Notifications from "expo-notifications";
import { useEffect, useRef } from "react";
import { AppState } from "react-native";

import { useAuth } from "@/auth/context";

import { registerForPushNotifications } from "./push-registration";

/**
 * Registers this device for native push once a user is signed in (M3-3). Runs the
 * Expo-token fetch + upsert on the transition to a session, and re-runs if the
 * signed-in user changes (a shared device), so the token is owned by the current
 * user. Mounted app-wide via {@link PushRegistrar}.
 *
 * Resilient to two failure modes: a *transient* registration failure (offline at
 * sign-in, a 5xx) doesn't latch the user as done, so it retries when the app next
 * returns to the foreground; and Expo *rotating* the push token mid-session is
 * picked up via a token listener that re-registers the new token.
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

    let cancelled = false;
    const attempt = async () => {
      if (cancelled || registeredForUser.current === userId) return;
      const result = await registerForPushNotifications();
      // Only latch as done when the attempt wasn't a transient failure — a
      // `failed` result stays retryable so the next foreground re-attempts it.
      if (!cancelled && result !== "failed") registeredForUser.current = userId;
    };

    void attempt();

    // Retry a not-yet-completed registration when the app returns to foreground.
    const appStateSub = AppState.addEventListener("change", (state) => {
      if (state === "active") void attempt();
    });
    // Survive mid-session token rotation: re-register whenever Expo issues a new
    // push token (clearing the latch so `attempt` runs again with the new token).
    const tokenSub = Notifications.addPushTokenListener(() => {
      registeredForUser.current = null;
      void attempt();
    });

    return () => {
      cancelled = true;
      appStateSub.remove();
      tokenSub.remove();
    };
  }, [userId]);
}

/** Null-rendering mount point so the registration hook runs under `AuthProvider`. */
export function PushRegistrar(): null {
  usePushRegistration();
  return null;
}
