"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "./database.types";
import { getPublicSupabaseConfig } from "./env";

/**
 * Browser (anon) Supabase client.
 *
 * Uses the public anon key; RLS still applies. Intended ONLY for auth flows and
 * realtime subscriptions in Client Components — never for privileged writes,
 * which go through the server (RLS) client. See design/02 § Supabase client
 * strategy.
 *
 * `createBrowserClient` returns a singleton per browser context, so calling
 * this from multiple components is safe.
 */
export function createBrowserSupabaseClient(): SupabaseClient<Database> {
  const { url, anonKey } = getPublicSupabaseConfig();
  return createBrowserClient<Database>(url, anonKey);
}
