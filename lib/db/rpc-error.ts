import { InternalError, UnauthenticatedError } from "@/lib/errors";

/**
 * The shape of a Supabase/PostgREST error as the provider service seams consume it.
 * `code` is the Postgres SQLSTATE (or a custom `PR*` class the RPCs raise); `hint`
 * carries RPC-supplied context (e.g. the authoritative version on a stale-version
 * conflict). Declared once here instead of re-typed per service (cutoff /
 * response-write / catalog), so a change to which fields an RPC error carries lives
 * in one place.
 */
export interface RpcError {
  code?: string;
  message?: string;
  hint?: string | null;
  details?: string | null;
}

/**
 * Map the Postgres SQLSTATEs every provider service treats identically:
 *   • `28000` (no session → `auth.uid()` is null in a SECURITY DEFINER RPC) → 401.
 *   • anything else → a 500 carrying `fallbackMessage` (the original error is kept as
 *     `cause` for server-side logging, never serialized to the client).
 *
 * Service-specific codes (the `PR*` response reasons, the catalog CHECK constraints)
 * are handled by the caller BEFORE delegating here for the common tail. Always throws.
 */
export function mapPgError(error: RpcError, fallbackMessage: string): never {
  if (error.code === "28000") throw new UnauthenticatedError();
  throw new InternalError(fallbackMessage, { cause: error });
}
