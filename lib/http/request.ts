/**
 * Request-boundary helpers shared by every route handler.
 *
 * Route handlers are thin: parse the request, run the guard, delegate to a
 * service, serialize the result (design/04 § 1). This module owns the "parse the
 * request" half so malformed input becomes a clean `ValidationError` (→ 400
 * envelope) instead of an unexpected `INTERNAL` 500. Kept free of `server-only`
 * and `next/*` imports so it is trivially unit-testable in a plain Node test.
 */

import { ValidationError } from "@/lib/errors";

/** A parsed JSON request body that is a plain object (not an array or scalar). */
export type JsonObject = Record<string, unknown>;

/**
 * Read and parse the request body as a JSON **object**. Throws `ValidationError`
 * (400) for a body that is absent/malformed JSON, or that parses to a non-object
 * (array, string, number, `null`). Callers then read individual fields off the
 * returned object and validate their types — the service re-validates as the
 * authoritative backstop.
 */
export async function readJsonObject(request: Request): Promise<JsonObject> {
  let parsed: unknown;
  try {
    parsed = await request.json();
  } catch {
    throw new ValidationError("Request body must be valid JSON.", [
      { field: "body", rule: "json" },
    ]);
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new ValidationError("Request body must be a JSON object.", [
      { field: "body", rule: "object" },
    ]);
  }

  return parsed as JsonObject;
}

/**
 * Like {@link readJsonObject} but for routes whose body is OPTIONAL: an absent /
 * empty body yields `{}` (the caller's field validators then see only defaults),
 * while a present-but-malformed body or a non-object still throws `ValidationError`.
 * Used by the suggestion accept/reject routes, where the owner's note is optional —
 * a bare POST (no body) must succeed, not 400 on "body must be valid JSON".
 */
export async function readOptionalJsonObject(
  request: Request,
): Promise<JsonObject> {
  const raw = await request.text();
  if (raw.trim() === "") return {};

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new ValidationError("Request body must be valid JSON.", [
      { field: "body", rule: "json" },
    ]);
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new ValidationError("Request body must be a JSON object.", [
      { field: "body", rule: "object" },
    ]);
  }

  return parsed as JsonObject;
}
