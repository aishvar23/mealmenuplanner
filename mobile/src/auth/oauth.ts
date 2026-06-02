import { getQueryParams } from "expo-auth-session/build/QueryParams";
import * as WebBrowser from "expo-web-browser";

import { AUTH_REDIRECT_URL } from "@/config";

import type { AuthResult } from "./actions";
import { supabase } from "./supabase";

/**
 * Google OAuth + deep-link session handling (M1-2, design/10 § 3).
 *
 * Flow: `signInWithOAuth({ skipBrowserRedirect: true })` hands back the provider
 * URL; we open it in the system auth session and wait for the
 * `mmp://auth-callback` redirect, then turn the returned URL into a Supabase
 * session. The same `createSessionFromUrl` powers the magic-link deep link
 * (`useAuthDeepLinks`), so a link opened from the email signs the user in too.
 *
 * Handles both Supabase auth flows defensively: PKCE returns `?code=…` (exchanged
 * for a session) and implicit returns `#access_token=…&refresh_token=…` (set
 * directly), so it works regardless of the client's `flowType`.
 */

// Dismisses the auth popup if one is still open from a previous attempt (web).
WebBrowser.maybeCompleteAuthSession();

/** Turn an auth redirect URL into a Supabase session. Returns true if one was set. */
export async function createSessionFromUrl(url: string): Promise<boolean> {
  const { params, errorCode } = getQueryParams(url);
  if (errorCode) throw new Error(errorCode);

  const { code, access_token, refresh_token } = params;

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) throw error;
    return true;
  }

  if (access_token && refresh_token) {
    const { error } = await supabase.auth.setSession({
      access_token,
      refresh_token,
    });
    if (error) throw error;
    return true;
  }

  return false;
}

export async function signInWithGoogle(): Promise<AuthResult> {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: AUTH_REDIRECT_URL,
      // We drive the browser ourselves so we can capture the redirect URL.
      skipBrowserRedirect: true,
    },
  });
  if (error) return { ok: false, message: error.message };
  if (!data?.url) {
    return { ok: false, message: "Could not start Google sign-in." };
  }

  const result = await WebBrowser.openAuthSessionAsync(
    data.url,
    AUTH_REDIRECT_URL,
  );

  if (result.type === "cancel" || result.type === "dismiss") {
    // User backed out — not an error worth surfacing.
    return { ok: true, needsEmailConfirmation: false };
  }
  if (result.type !== "success" || !result.url) {
    return { ok: false, message: "Google sign-in didn't complete." };
  }

  try {
    const created = await createSessionFromUrl(result.url);
    if (!created) {
      return { ok: false, message: "Google sign-in didn't return a session." };
    }
    return { ok: true, needsEmailConfirmation: false };
  } catch (e) {
    const message =
      e instanceof Error ? e.message : "Google sign-in failed. Try again.";
    return { ok: false, message };
  }
}
