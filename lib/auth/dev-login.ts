import "server-only";

/**
 * Local-only "dev quick sign-in" — a convenience for testing authenticated
 * flows (notably onboarding) without manually going through Google/magic-link.
 *
 * ⚠️ SAFETY: this can NEVER activate in a deployed app. {@link isDevLoginEnabled}
 * is hard-gated on `NODE_ENV !== "production"` AND an explicit opt-in flag, so a
 * production build (`next build`, where `NODE_ENV === "production"`) disables it
 * even if the flag is somehow set. It only runs under `next dev`. The route that
 * uses it 404s when disabled, so its existence isn't observable in prod.
 *
 * It is not a bypass: it provisions and signs in a real test account, yielding a
 * genuine Supabase session (so RLS-backed reads/writes work end to end).
 */

const DEFAULT_DEV_EMAIL = "dev@local.test";
// Comfortably above Supabase's minimum password length; override via env.
const DEFAULT_DEV_PASSWORD = "dev-password-1234";

/**
 * True only under `next dev` with `DEV_LOGIN_ENABLED=true`. Read by both the
 * sign-in page (to render the button) and the dev route (to gate the action).
 */
export function isDevLoginEnabled(): boolean {
  return (
    process.env.NODE_ENV !== "production" &&
    process.env.DEV_LOGIN_ENABLED === "true"
  );
}

/**
 * The test-account credentials, overridable via `DEV_LOGIN_EMAIL` /
 * `DEV_LOGIN_PASSWORD`. Use a fresh email to test first-run onboarding from a
 * clean slate; the same account is reused (and reaches the edit flow) once it
 * has a household.
 */
export function getDevLoginCredentials(): { email: string; password: string } {
  return {
    email: process.env.DEV_LOGIN_EMAIL ?? DEFAULT_DEV_EMAIL,
    password: process.env.DEV_LOGIN_PASSWORD ?? DEFAULT_DEV_PASSWORD,
  };
}
