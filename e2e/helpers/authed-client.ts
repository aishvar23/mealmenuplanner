import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Programmatic, RLS-respecting Supabase client signed in as a real test user.
 *
 * This is the counterpart to the service-role `createAdminClient` (which bypasses
 * RLS for test setup): it uses the **anon** key and a real email/password sign-in,
 * so every `.from(...)`/`.rpc(...)` it issues is evaluated under the signed-in
 * user's Postgres RLS context. The integration/RLS suite (MP-A-180) uses it to
 * prove the actual row-level policies — owner full access, customer own-scope
 * only, cross-provider denial — rather than only the API-route authorization layer
 * (which the `page.request` specs already cover).
 *
 * Decoupled from app modules on purpose (no `@/` alias, no `server-only`) so the
 * Playwright transpiler resolves it the same way it resolves `supabase-admin.ts`.
 */
export async function createAuthedClient(
  email: string,
  password: string,
): Promise<SupabaseClient> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error(
      "E2E: NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY must be " +
        "set (put them in .env.local or .env.e2e — see e2e/README.md).",
    );
  }
  const client = createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) {
    throw new Error(`E2E: sign-in failed for ${email}: ${error.message}`);
  }
  return client;
}
