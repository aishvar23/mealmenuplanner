import "server-only";

import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

import type { Database } from "./database.types";
import { getPublicSupabaseConfig } from "./env";

/**
 * Per-request, RLS-scoped Supabase client.
 *
 * Seeded with the request cookies so the user's JWT reaches Postgres and
 * `auth.uid()` drives Row-Level Security. This is the DEFAULT client for all
 * user-initiated reads/writes in Server Components, Server Actions, and Route
 * Handlers. See design/02 § Supabase client strategy and design/03 § 1.
 *
 * `cookies()` is async in Next.js (App Router), so this factory is async too.
 */
export async function createServerSupabaseClient(): Promise<
  SupabaseClient<Database>
> {
  const cookieStore = await cookies();
  const { url, anonKey } = getPublicSupabaseConfig();

  return createServerClient<Database>(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // `setAll` was called from a Server Component, where cookie writes
          // are not allowed. Safe to ignore: session refresh happens in the
          // route middleware (P1-3), which can write cookies.
        }
      },
    },
  });
}
