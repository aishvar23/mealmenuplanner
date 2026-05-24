import { NextResponse } from "next/server";

import { resolvePostAuthRedirect } from "@/lib/auth/route-access";
import { createServerSupabaseClient } from "@/lib/db/server";

// Always run per-request: it reads the `code` query param and writes auth
// cookies — never statically cached.
export const dynamic = "force-dynamic";

function signInRedirect(origin: string, message: string): NextResponse {
  const url = new URL("/sign-in", origin);
  url.searchParams.set("error", message);
  return NextResponse.redirect(url);
}

/**
 * OAuth / magic-link / email-confirmation callback (design/03 § 2). Supabase
 * redirects here with a one-time `code`; `exchangeCodeForSession` swaps it
 * (using the PKCE verifier cookie) for a session and sets the HTTP-only,
 * Secure, SameSite=Lax auth cookies via the per-request server client. The same
 * route serves Google OAuth (P1-1) and the email-link flows (P1-2: magic link
 * and email-confirmation sign-up). On the first sign-in the `auth.users` insert
 * fires `trg_provision_user_profile` (P0-13), so a `public.users` profile
 * exists before the user lands in the app.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const { searchParams, origin } = new URL(request.url);

  // The provider can bounce back with an error (e.g. the user declined consent).
  const providerError = searchParams.get("error");
  if (providerError) {
    const description = searchParams.get("error_description") ?? providerError;
    return signInRedirect(origin, description);
  }

  const code = searchParams.get("code");
  if (!code) {
    return signInRedirect(
      origin,
      "Sign-in link was missing its code. Please try again.",
    );
  }

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    // Generic message: don't surface provider/SQL internals to the user.
    return signInRedirect(
      origin,
      "Could not complete sign-in. Please try again.",
    );
  }

  return NextResponse.redirect(
    new URL(resolvePostAuthRedirect(searchParams.get("next")), origin),
  );
}
