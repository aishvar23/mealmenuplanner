import { AUTH_REDIRECT_URL } from "@/config";

import { supabase } from "./supabase";

/**
 * Auth actions (design/10 § 3) — thin wrappers over Supabase Auth that the
 * sign-in screen calls. Each returns a discriminated `AuthResult` so the UI
 * branches on a typed outcome instead of catching: a Supabase `AuthError` maps
 * to a friendly message, and the magic-link / sign-up paths report that a
 * confirmation email was sent (no session yet).
 *
 * The session itself is persisted by the Supabase client's secure-store adapter
 * and surfaced through `AuthProvider`; these functions never touch storage.
 */

export type AuthResult =
  | { ok: true; needsEmailConfirmation: boolean }
  | { ok: false; message: string };

/** Friendly, user-safe message for a Supabase auth failure. */
function authErrorMessage(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("invalid login credentials")) {
    return "That email or password doesn't match. Please try again.";
  }
  if (m.includes("already registered")) {
    return "An account with this email already exists. Try signing in.";
  }
  if (m.includes("email not confirmed")) {
    return "Please confirm your email first — check your inbox.";
  }
  if (m.includes("rate limit") || m.includes("too many")) {
    return "Too many attempts. Please wait a moment and try again.";
  }
  return message;
}

export async function signInWithEmail(
  email: string,
  password: string,
): Promise<AuthResult> {
  const { error } = await supabase.auth.signInWithPassword({
    email: email.trim(),
    password,
  });
  if (error) return { ok: false, message: authErrorMessage(error.message) };
  return { ok: true, needsEmailConfirmation: false };
}

export async function signUpWithEmail(
  email: string,
  password: string,
): Promise<AuthResult> {
  const { data, error } = await supabase.auth.signUp({
    email: email.trim(),
    password,
    options: { emailRedirectTo: AUTH_REDIRECT_URL },
  });
  if (error) return { ok: false, message: authErrorMessage(error.message) };
  // With email confirmation on, `signUp` returns a user but no session until the
  // link is clicked; treat a missing session as "confirm your email".
  return { ok: true, needsEmailConfirmation: data.session == null };
}

export async function sendMagicLink(email: string): Promise<AuthResult> {
  const { error } = await supabase.auth.signInWithOtp({
    email: email.trim(),
    options: { emailRedirectTo: AUTH_REDIRECT_URL },
  });
  if (error) return { ok: false, message: authErrorMessage(error.message) };
  return { ok: true, needsEmailConfirmation: true };
}
