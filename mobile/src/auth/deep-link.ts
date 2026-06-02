import * as Linking from "expo-linking";
import { useEffect } from "react";

import { createSessionFromUrl } from "./oauth";

/**
 * Listen for `mmp://auth-callback` deep links and exchange them for a session
 * (M1-2, design/10 § 3). This is what makes a **magic link** opened from the
 * email actually sign the user in: it covers both a warm app (the `url` event)
 * and a cold start (the initial URL). Mounted once at the router root.
 *
 * OAuth via `WebBrowser.openAuthSessionAsync` returns its redirect URL directly,
 * so this listener is the safety net for links that arrive through the OS.
 */
export function useAuthDeepLinks(): void {
  useEffect(() => {
    let active = true;

    async function handle(url: string | null) {
      if (!active || !url || !url.includes("auth-callback")) return;
      try {
        await createSessionFromUrl(url);
      } catch {
        // A malformed/expired link can't sign in; the user stays on sign-in.
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
