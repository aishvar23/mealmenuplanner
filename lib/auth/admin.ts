/**
 * Admin (operator) role model — pure, runtime-agnostic.
 *
 * The operator console and the content-write APIs are gated by an **admin
 * role**, distinct from the per-household `can_*` permissions: it grants no
 * household access, only the right to maintain the global dish/ingredient
 * catalog (design/03 § 5, docs/06).
 *
 * The role is carried as the `app_role` claim — Supabase stores it in the
 * user's `app_metadata` (server-controlled; a user can never set it on
 * themselves, unlike `user_metadata`). The matching RLS write policies on the
 * content tables read `auth.jwt() ->> 'app_role'` (design/03 § 5, P0-12) as the
 * database-level backstop; this predicate is the application-layer gate the
 * `requireAdmin` guard and the proxy/layout share.
 *
 * Kept free of `server-only`, Supabase clients, and `next/*` (only a type-only
 * `User` import) so it runs in the Edge proxy and is trivially unit-testable.
 */

import type { User } from "@supabase/supabase-js";

/** The `app_role` claim value that grants operator access. */
export const ADMIN_APP_ROLE = "admin";

/**
 * The minimal user shape this module reads — just `app_metadata`. Accepting a
 * structural type (rather than the full `User`) lets the Edge proxy pass its
 * own resolved user without coupling to the SDK's exact `User` type.
 */
export interface UserWithAppMetadata {
  app_metadata?: { app_role?: unknown } & Record<string, unknown>;
}

/**
 * Read the `app_role` claim from a verified user, or `null` when absent. Reads
 * only `app_metadata` (the server-controlled namespace), never `user_metadata`.
 */
export function getAppRole(
  user: UserWithAppMetadata | User | null | undefined,
): string | null {
  const role = user?.app_metadata?.app_role;
  return typeof role === "string" ? role : null;
}

/**
 * True iff the verified user holds the operator (`admin`) `app_role`. A missing
 * user or any other role value is not an admin.
 */
export function isAdminUser(
  user: UserWithAppMetadata | User | null | undefined,
): boolean {
  return getAppRole(user) === ADMIN_APP_ROLE;
}
