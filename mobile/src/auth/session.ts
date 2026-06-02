import { supabase } from "./supabase";

/**
 * Current access token (Supabase JWT) for the API client's `Authorization`
 * header, or null when signed out. `getSession()` reads the persisted session
 * and refreshes it if near expiry.
 */
export async function getAccessToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

/**
 * Force a token refresh after a `401` (design/10 § 4). Returns true when a fresh
 * session was obtained, so the API client can retry the request once.
 */
export async function refreshSession(): Promise<boolean> {
  const { data, error } = await supabase.auth.refreshSession();
  return !error && data.session != null;
}
