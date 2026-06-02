import "server-only";

import { createServerSupabaseClient } from "@/lib/db/server";
import { ConflictError } from "@/lib/errors";
import type { Json } from "@/lib/db/database.types";

import { normalizeIdempotencyKey, requestHash } from "./hash";

/**
 * `idempotency` service — server-side `Idempotency-Key` replay protection for the
 * generation endpoints (design/04 § 3, design/10 § 4).
 *
 * Wraps a generation handler so that a retry carrying the same `Idempotency-Key`
 * returns the **stored response** instead of generating a second plan/list:
 *
 * - **No key** → run normally, persist nothing (no replay protection).
 * - **First use of a key** → run, persist `(household_id, key)` with the response
 *   (status + body) for a 24h window, return it.
 * - **Replay (same key + identical request)** → return the stored response
 *   verbatim, with `Idempotency-Replayed: true`. The generator does NOT re-run.
 * - **Same key, different request** → `409 CONFLICT`
 *   (`error.details.reason = "idempotency_key_reused"`).
 *
 * The persistence row is RLS-scoped to active household members; the specific
 * `can_change_*` permission is enforced by `run()` itself (the service it wraps),
 * so a fresh call still goes through the normal guard before anything is stored.
 *
 * Postgres unique-violation code on `(household_id, idempotency_key)`.
 */
const UNIQUE_VIOLATION = "23505";

export interface IdempotencyParams<T> {
  /** Tenancy scope — the key is unique per household. */
  householdId: string;
  /** Raw `Idempotency-Key` header value (may be null/blank → no protection). */
  key: string | null | undefined;
  /** Stable endpoint discriminator, e.g. `"meal-plans/today/generate"`. */
  endpoint: string;
  /** The normalized request (validated body) — hashed to detect key reuse. */
  request: unknown;
  /** HTTP status for a fresh success (201 for generate, 200 for regenerate). */
  successStatus: number;
  /** The generation work; its JSON result is the stored/returned body. */
  run: () => Promise<T>;
}

/**
 * Execute `run` under idempotency protection and return the HTTP `Response`
 * (fresh, replayed, or — never returned, thrown — a reuse conflict).
 */
export async function withIdempotency<T>(
  params: IdempotencyParams<T>,
): Promise<Response> {
  const { householdId, endpoint, request, successStatus, run } = params;
  const key = normalizeIdempotencyKey(params.key);

  // No key: behave exactly as the endpoint did before — run and return.
  if (key === null) {
    const result = await run();
    return Response.json(result, { status: successStatus });
  }

  const hash = requestHash(endpoint, request);
  const supabase = await createServerSupabaseClient();

  // Replay path: a live row for this (household, key)?
  const existing = await loadKey(supabase, householdId, key);
  if (existing) {
    return replayOrConflict(existing, hash);
  }

  // Fresh path: run the generator, then persist the response under the key.
  const result = await run();

  const { error } = await supabase.from("idempotency_keys").insert({
    household_id: householdId,
    idempotency_key: key,
    endpoint,
    request_hash: hash,
    response_status: successStatus,
    response_body: result as Json,
  });

  if (error) {
    // A concurrent request with the same key won the insert race. Re-read and
    // replay its stored response (or 409 if it was a different request).
    if (error.code === UNIQUE_VIOLATION) {
      const winner = await loadKey(supabase, householdId, key);
      if (winner) {
        return replayOrConflict(winner, hash);
      }
    }
    throw error;
  }

  return Response.json(result, { status: successStatus });
}

type StoredKey = {
  request_hash: string;
  response_status: number;
  response_body: Json;
};

/** Look up a live (unexpired) idempotency row for this household + key. */
async function loadKey(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  householdId: string,
  key: string,
): Promise<StoredKey | null> {
  const { data } = await supabase
    .from("idempotency_keys")
    .select("request_hash, response_status, response_body")
    .eq("household_id", householdId)
    .eq("idempotency_key", key)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();
  return data ?? null;
}

/** Replay a stored response, or throw a reuse conflict on a hash mismatch. */
function replayOrConflict(stored: StoredKey, hash: string): Response {
  if (stored.request_hash !== hash) {
    throw new ConflictError(
      "This Idempotency-Key was already used for a different request.",
      { reason: "idempotency_key_reused" },
    );
  }
  return Response.json(stored.response_body, {
    status: stored.response_status,
    headers: { "Idempotency-Replayed": "true" },
  });
}
