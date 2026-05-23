/**
 * Route access classification — pure, runtime-agnostic helpers shared by the
 * Edge middleware and any server code that needs to reason about which paths
 * require an authenticated session.
 *
 * Kept free of `next/*`, `server-only`, and Supabase imports so it runs in the
 * Edge runtime (middleware) and is trivially unit-testable. See design/03 § 1.
 */

/**
 * Path prefixes that require an authenticated session.
 *
 * These are the `(app)` shell routes — the route group `(app)` produces no URL
 * segment, so its children surface at the top level (`/today`, `/plan`, …) —
 * plus the `/admin` operator console. Admin additionally gets a role check in
 * P3-1; here it only needs to be behind authentication.
 *
 * Add any new authenticated route prefix here.
 */
export const PROTECTED_PREFIXES = [
  "/today",
  "/plan",
  "/grocery",
  "/household",
  "/notifications",
  "/onboarding",
  "/admin",
] as const;

/**
 * True when `pathname` is (or is nested under) a protected route. Matches on a
 * `/` boundary so `/plan` and `/plan/edit` are protected but `/plans` is not.
 */
export function isProtectedPath(pathname: string): boolean {
  return PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

/** The sign-in screen — an authenticated user is bounced away from it. */
export function isAuthPath(pathname: string): boolean {
  return pathname === "/sign-in";
}

/**
 * Build the `/sign-in` URL to redirect an unauthenticated visitor to, threading
 * the originally-requested path through `?next=` so they land back there after
 * signing in.
 *
 * Only a same-origin, absolute path is preserved as `next` (e.g. `/plan`); a
 * protocol-relative (`//evil.com`) or absolute URL is dropped, so the param
 * can't be turned into an open redirect. The callback re-validates `next` the
 * same way before honoring it.
 */
export function buildSignInUrl(origin: string, next: string): URL {
  const url = new URL("/sign-in", origin);
  if (next.startsWith("/") && !next.startsWith("//")) {
    url.searchParams.set("next", next);
  }
  return url;
}
