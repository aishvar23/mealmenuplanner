import "server-only";

import type { User } from "@supabase/supabase-js";

import { createServerSupabaseClient } from "@/lib/db/server";
import { UnauthenticatedError } from "@/lib/errors";

/**
 * Resolve and VERIFY the current session on the server.
 *
 * Calls `supabase.auth.getUser()`, which revalidates the JWT against Supabase
 * Auth on every call — it does not merely decode the cookie — so an expired,
 * tampered, or absent token yields `null`. This is the single source of "who is
 * the current user" for Server Components, Server Actions, and Route Handlers;
 * the resolved id (`auth.users.id` = `public.users.id`) is what later gets
 * threaded into the service layer, where the same JWT drives `auth.uid()` and
 * RLS. (design/03 § 1)
 *
 * Returns the verified user, or `null` when there is no valid session. (On an
 * auth error the SDK leaves `user` null, so the null contract already covers it.)
 */
export async function getAuthUser(): Promise<User | null> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

/**
 * Like {@link getAuthUser}, but throws `UnauthenticatedError` when there is no
 * session — for Route Handlers / Server Actions, where the error boundary maps
 * it to a 401. UI surfaces (layouts, pages) that should *redirect* instead use
 * `getAuthUser()` together with `redirect("/sign-in")`.
 */
export async function requireAuthUser(): Promise<User> {
  const user = await getAuthUser();
  if (!user) {
    throw new UnauthenticatedError();
  }
  return user;
}
