/**
 * Pure helpers for the Idempotency-Key contract (design/04 § 3). No I/O — kept
 * separate from the server-only persistence layer so the hashing/normalization
 * is trivially unit-testable.
 */

import { createHash } from "node:crypto";

import { ValidationError } from "@/lib/errors";

/** Upper bound on a stored `Idempotency-Key` (chars). */
const MAX_KEY_LENGTH = 255;

/**
 * Deterministically serialize a JSON-ish value with object keys sorted, so two
 * logically-identical request bodies (regardless of key order) hash the same.
 * Arrays keep their order (order is semantic); `undefined` object fields are
 * dropped, matching JSON semantics.
 */
export function canonicalize(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortValue);
  }
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      const v = (value as Record<string, unknown>)[key];
      if (v !== undefined) {
        out[key] = sortValue(v);
      }
    }
    return out;
  }
  return value;
}

/**
 * Hash that identifies a logical request: the endpoint discriminator plus the
 * canonical request body. A replay with the same `Idempotency-Key` and a
 * matching hash is a true retry (→ replay the stored response); a mismatch means
 * the key was reused for a different request (→ 409 `idempotency_key_reused`).
 */
export function requestHash(endpoint: string, request: unknown): string {
  return createHash("sha256")
    .update(`${endpoint}\n${canonicalize(request)}`)
    .digest("hex");
}

/**
 * Normalize an incoming `Idempotency-Key` header value: trim and treat blank as
 * absent (`null`, → no replay protection). An over-long value is a malformed
 * key, so it is *rejected* with a 400 rather than silently downgraded to "no
 * protection" — which would let a buggy client defeat the contract unnoticed.
 */
export function normalizeIdempotencyKey(
  raw: string | null | undefined,
): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;
  if (trimmed.length > MAX_KEY_LENGTH) {
    throw new ValidationError(
      `Idempotency-Key must be at most ${MAX_KEY_LENGTH} characters.`,
    );
  }
  return trimmed;
}
