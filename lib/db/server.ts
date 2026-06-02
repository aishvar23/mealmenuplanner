import "server-only";

import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies, headers } from "next/headers";

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
 * **Bearer-token (mobile) auth.** Native clients carry no auth cookies; they
 * send `Authorization: Bearer <jwt>` instead (design/10 § 3). When that header
 * is present *and there is no Supabase auth cookie*, we forward it via
 * `global.headers`, which makes BOTH `supabase.auth.getUser()` (used by
 * `lib/auth/session.ts`) and PostgREST/RLS resolve the mobile user's JWT.
 *
 * The cookie guard is deliberate. If both transports were active at once they
 * would resolve different identities — `getUser()` keys off the cookie session
 * while PostgREST honors the pre-set `Authorization` header — so a browser
 * request could split its auth identity across the guard and the DB query. By
 * ignoring the header whenever an auth cookie is present we keep exactly one
 * identity per request: browsers stay on the cookie path (zero web behavior
 * change), genuine cookieless native clients use the bearer path.
 *
 * `cookies()` / `headers()` are async in Next.js (App Router), so this factory
 * is async too.
 */
export async function createServerSupabaseClient(): Promise<
  SupabaseClient<Database>
> {
  const cookieStore = await cookies();
  const headerStore = await headers();
  const { url, anonKey } = getPublicSupabaseConfig();

  // Bearer auth is for cookieless native clients only. If the request carries a
  // Supabase auth cookie (`sb-<ref>-auth-token`), the cookie session is
  // authoritative and any `Authorization` header is ignored — see the note above
  // on avoiding a split identity.
  const hasAuthCookie = cookieStore
    .getAll()
    .some((cookie) => cookie.name.includes("-auth-token"));
  const authorization = hasAuthCookie
    ? undefined
    : (headerStore.get("authorization") ?? undefined);

  return createServerClient<Database>(url, anonKey, {
    ...(authorization
      ? { global: { headers: { Authorization: authorization } } }
      : {}),
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
          // edge proxy (`proxy.ts`), which can write cookies.
        }
      },
    },
  });
}
