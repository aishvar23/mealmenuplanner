import * as Linking from "expo-linking";
import { useEffect } from "react";
import { Alert } from "react-native";

import { createSessionFromUrl } from "./oauth";

/**
 * Listen for `mmp://auth-callback` deep links and exchange them for a session
 * (M1-2, design/10 § 3). This is what makes a **magic link** opened from the
 * email actually sign the user in: it covers both a warm app (the `url` event)
 * and a cold start (the initial URL). Mounted once at the router root.
 *
 * OAuth via `WebBrowser.openAuthSessionAsync` returns its redirect URL directly,
 * so this listener is the safety net for links that arrive through the OS.
 *
 * This is the *only* entry point for a magic link opened from email, so a failure
 * here (expired/used link, or a callback URL with no session in it) must be
 * surfaced — otherwise the user lands back on sign-in with no idea why and keeps
 * retrying the dead link.
 */
export function useAuthDeepLinks(): void {
  useEffect(() => {
    let active = true;

    async function handle(url: string | null) {
      if (!active || !url || !url.includes("auth-callback")) return;
      try {
        const created = await createSessionFromUrl(url);
        if (!created && active) {
          Alert.alert(
            "Couldn't sign you in",
            "That sign-in link didn't contain a valid session. Please request a new link and try again.",
          );
        }
      } catch {
        // A malformed/expired/already-used link can't sign in.
        if (active) {
          Alert.alert(
            "Sign-in link expired",
            "That sign-in link has expired or was already used. Please request a new link and try again.",
          );
        }
      }
    }

    Linking.getInitialURL().then(handle);
    const sub = Linking.addEventListener("url", ({ url }) => handle(url));

    return () => {
      active = false;
      sub.remove();
    };
  }, []);
}
