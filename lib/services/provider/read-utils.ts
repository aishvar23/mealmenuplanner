import "server-only";

import { createServerSupabaseClient } from "@/lib/db/server";
import { InternalError, UnauthenticatedError } from "@/lib/errors";

/**
 * Shared helpers for the provider READ services (`menu-read`, `response-read`,
 * …). These were duplicated verbatim across each read module; they live here so
 * the numeric-coercion and DB-error-mapping rules are single-sourced.
 */

/** A per-request, RLS-scoped server Supabase client. */
export type SupabaseClient = Awaited<
  ReturnType<typeof createServerSupabaseClient>
>;

/** `numeric | null` → `number | null` (PostgREST may serialize numeric as string). */
export function numOrNull(value: number | string | null): number | null {
  return value === null ? null : Number(value);
}

/**
 * Map a Supabase read error: Postgres `28000` (RLS/role denial) is an auth
 * failure; anything else is internal, surfaced with `message` (the caller-facing
 * "Failed to load …" copy) and the raw error as `cause`.
 */
export function mapReadError(
  error: { code?: string; message?: string },
  message: string,
): never {
  if (error.code === "28000") throw new UnauthenticatedError();
  throw new InternalError(message, { cause: error });
}
