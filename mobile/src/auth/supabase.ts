import "react-native-url-polyfill/auto";

import { createClient } from "@supabase/supabase-js";
import { AppState } from "react-native";

import {
  assertSupabaseConfig,
  SUPABASE_ANON_KEY,
  SUPABASE_URL,
} from "@/config";

import { secureStorageAdapter } from "./secure-store";

// Fail fast with an actionable message if the env vars are missing, rather than
// letting `createClient("")` surface a cryptic error deep in the first request.
assertSupabaseConfig();

/**
 * The app's Supabase client (design/10 § 3). It authenticates directly with
 * Supabase Auth and persists the session in secure storage; the resulting JWT is
 * attached as a bearer token to every `/api/*` call by the API client.
 *
 * `detectSessionInUrl` is false (no browser URL to parse in a native app);
 * OAuth deep links are handled explicitly by `expo-auth-session` (M1-2).
 */
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: secureStorageAdapter,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

/**
 * Drive Supabase token auto-refresh off the app's foreground state: refresh
 * while active, pause in the background (recommended pattern for RN).
 */
AppState.addEventListener("change", (state) => {
  if (state === "active") {
    supabase.auth.startAutoRefresh();
  } else {
    supabase.auth.stopAutoRefresh();
  }
});
