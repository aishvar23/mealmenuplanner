import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import {
  buildSignInUrl,
  isAuthPath,
  isProtectedPath,
} from "@/lib/auth/route-access";
import { getPublicSupabaseConfig } from "@/lib/db/env";

/**
 * Edge proxy (Next.js 16's renamed `middleware`): refresh the auth session and
 * gate the authenticated shell.
 *
 * Two responsibilities (design/02 § layered request flow, design/03 § 1):
 *
 *  1. **SSR cookie refresh.** Server Components can read cookies but cannot
 *     write them, so the access token has to be refreshed somewhere that can —
 *     here. `getUser()` revalidates the JWT against Supabase Auth and, when it
 *     has expired, transparently refreshes it; the new tokens are written back
 *     as HTTP-only cookies via `setAll` below, keeping every downstream request
 *     authenticated.
 *  2. **Redirect gating.** Unauthenticated visitors to a protected route are
 *     sent to `/sign-in?next=…`; already-signed-in visitors to `/sign-in` are
 *     sent on to the app. The protected server layouts re-resolve the user as a
 *     defense-in-depth backstop — the proxy is convenience, not the only gate.
 *
 * Import note: this pulls only the pure `route-access` helpers, never the
 * `server-only` session module (which depends on `next/headers`, unavailable in
 * the Edge runtime).
 */
export async function proxy(request: NextRequest): Promise<NextResponse> {
  // Response we attach refreshed auth cookies to. Recreated inside `setAll` so
  // the refreshed tokens are also visible to this same request downstream.
  let response = NextResponse.next({ request });

  const { url, anonKey } = getPublicSupabaseConfig();
  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  // IMPORTANT: do not run any logic between `createServerClient` and
  // `getUser()`. `getUser()` is what triggers the token refresh + `setAll`;
  // interleaving work here is the classic Supabase SSR footgun that randomly
  // logs users out.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname, search, origin } = request.nextUrl;

  if (!user && isProtectedPath(pathname)) {
    return withCookies(
      response,
      NextResponse.redirect(buildSignInUrl(origin, `${pathname}${search}`)),
    );
  }

  if (user && isAuthPath(pathname)) {
    return withCookies(
      response,
      NextResponse.redirect(new URL("/today", origin)),
    );
  }

  return response;
}

/**
 * Carry any refreshed auth cookies from the working response onto a redirect
 * response — `NextResponse.redirect` starts a fresh response, so without this a
 * token refresh that coincides with a redirect would be lost.
 */
function withCookies(from: NextResponse, to: NextResponse): NextResponse {
  for (const cookie of from.cookies.getAll()) {
    to.cookies.set(cookie);
  }
  return to;
}

export const config = {
  /*
   * Run on every request except Next internals and static asset files, so the
   * session token is refreshed across the whole app — not just protected
   * routes. The redirect gating inside `proxy` then decides per-path.
   */
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
