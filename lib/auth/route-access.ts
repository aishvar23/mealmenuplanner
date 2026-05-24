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

/** Where an authenticated user lands when no specific `next` is requested. */
export const DEFAULT_POST_AUTH_PATH = "/today";

/**
 * True for a **safe same-origin, absolute path** (e.g. `/plan`,
 * `/household/members?tab=invites`). A protocol-relative target (`//evil.com`)
 * or an absolute URL (`https://evil.com`) is rejected, so a `next` value can
 * never be turned into an open redirect. This is the single predicate every
 * redirect path (`buildSignInUrl`, the auth callback, the sign-in forms) shares.
 */
export function isSafeRelativePath(path: string): boolean {
  return path.startsWith("/") && !path.startsWith("//");
}

/**
 * Resolve the post-sign-in destination: the requested `next` when it is a safe
 * relative path, otherwise {@link DEFAULT_POST_AUTH_PATH}. Used by the auth
 * callback (server) and the sign-in forms (client) so an attacker-supplied
 * `next` can never redirect off-origin.
 */
export function resolvePostAuthRedirect(
  next: string | null | undefined,
): string {
  return next && isSafeRelativePath(next) ? next : DEFAULT_POST_AUTH_PATH;
}

/**
 * Build the `/sign-in` URL to redirect an unauthenticated visitor to, threading
 * the originally-requested path through `?next=` so they land back there after
 * signing in.
 *
 * Only a same-origin, absolute path is preserved as `next`; an open-redirect
 * target is dropped (see {@link isSafeRelativePath}). The callback re-validates
 * `next` the same way before honoring it.
 */
export function buildSignInUrl(origin: string, next: string): URL {
  const url = new URL("/sign-in", origin);
  if (isSafeRelativePath(next)) {
    url.searchParams.set("next", next);
  }
  return url;
}
