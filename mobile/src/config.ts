/**
 * Runtime configuration (design/10 § 4). All values come from `EXPO_PUBLIC_*`
 * env vars, which Expo inlines into the bundle at build time. Copy
 * `.env.example` to `.env` for local development.
 *
 * - `API_BASE_URL` — the Next.js `/api/*` host. Prod is `mymealtoday.com`; point
 *   it at the `:3100` clone (or `:3000`) for local dev. Note that on a physical
 *   device "localhost" is the device, not your machine — use your LAN IP.
 * - `SUPABASE_URL` / `SUPABASE_ANON_KEY` — the app authenticates directly with
 *   Supabase Auth (design/10 § 3); the anon key is safe on the client (RLS still
 *   applies).
 */

const PROD_API_BASE_URL = "https://mymealtoday.com";

export const API_BASE_URL = (
  process.env.EXPO_PUBLIC_API_BASE_URL ?? PROD_API_BASE_URL
).replace(/\/+$/, "");

export const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? "";
export const SUPABASE_ANON_KEY =
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "";

/** OAuth / magic-link deep-link target — matches `scheme` in app.json. */
export const AUTH_REDIRECT_URL = "mmp://auth-callback";

/** Throws early with a clear message if Supabase config is missing. */
export function assertSupabaseConfig(): void {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error(
      "Missing EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY. Copy mobile/.env.example to mobile/.env and fill them in.",
    );
  }
}
