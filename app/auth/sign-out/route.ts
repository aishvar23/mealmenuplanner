import { NextResponse } from "next/server";

import { createServerSupabaseClient } from "@/lib/db/server";

// Clears the auth cookies on this response; never statically cached.
export const dynamic = "force-dynamic";

/**
 * `POST /auth/sign-out` — end the current session (design/03 § 2).
 *
 * Calls `supabase.auth.signOut()` on the per-request server client, which clears
 * the HTTP-only Supabase auth cookies via the same cookie adapter that
 * `/auth/callback` and `/api/dev/sign-in` use to *set* them — so the session is
 * authoritatively revoked server-side. The client then does a full navigation to
 * `/sign-in`; the edge proxy sees no user and the protected layouts re-resolve to
 * `null`, so there's no stale-session window.
 *
 * POST-only and same-origin so a prefetch or cross-site GET can't log the user
 * out. We don't fail the request if `signOut` errors: the cookies are cleared
 * regardless, and the goal — the user is no longer signed in here — is met.
 */
export async function POST(): Promise<Response> {
  const supabase = await createServerSupabaseClient();
  await supabase.auth.signOut();
  return NextResponse.json({ ok: true });
}
