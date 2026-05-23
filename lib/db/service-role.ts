import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "./database.types";
import { getPublicSupabaseConfig, getServiceRoleKey } from "./env";

/**
 * Service-role Supabase client — ⚠️ BYPASSES Row-Level Security.
 *
 * Permitted ONLY inside Edge Functions / cron jobs (e.g. `expire_guests`,
 * `expire_invites`, `prep_reminders`) and admin tooling. NEVER import this into
 * a user-request path — RLS is the cross-household isolation backstop, and this
 * client skips it entirely. See design/02 § Supabase client strategy and
 * design/03 § 1.
 *
 * The `server-only` import makes bundling this into client code a build error;
 * the doc contract above guards against misuse on the server side.
 *
 * No session is persisted or auto-refreshed: each job/admin call is stateless.
 */
export function createServiceRoleClient(): SupabaseClient<Database> {
  const { url } = getPublicSupabaseConfig();
  const serviceRoleKey = getServiceRoleKey();

  return createClient<Database>(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });
}
