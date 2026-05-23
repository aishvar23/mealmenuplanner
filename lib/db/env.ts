/**
 * Supabase environment configuration.
 *
 * Centralizes reading + validating the Supabase env vars so every client
 * factory fails loudly with the same clear message when configuration is
 * missing, rather than handing an empty string to `supabase-js`.
 *
 * `NEXT_PUBLIC_*` vars MUST be referenced with literal `process.env.NEXT_PUBLIC_X`
 * access (not dynamic lookup) so Next.js can inline them into the browser bundle.
 * See design/02 § Environments & configuration.
 */

/** URL + anon key — safe in the browser; RLS still applies. */
export function getPublicSupabaseConfig(): { url: string; anonKey: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url) {
    throw new Error(
      "Missing env var NEXT_PUBLIC_SUPABASE_URL. Copy .env.example to .env.local and fill it in (see supabase/README.md).",
    );
  }
  if (!anonKey) {
    throw new Error(
      "Missing env var NEXT_PUBLIC_SUPABASE_ANON_KEY. Copy .env.example to .env.local and fill it in (see supabase/README.md).",
    );
  }

  return { url, anonKey };
}

/**
 * Service-role key — bypasses Row-Level Security. Server/Edge/cron only.
 * Read only inside the service-role factory (which is `server-only`), never
 * in a user-request path. See design/02 § Supabase client strategy.
 */
export function getServiceRoleKey(): string {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    throw new Error(
      "Missing env var SUPABASE_SERVICE_ROLE_KEY. It is server-only and must never be exposed to the browser (see supabase/README.md).",
    );
  }
  return key;
}
