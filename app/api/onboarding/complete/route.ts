import { withErrorBoundary } from "@/lib/errors";
import { readJsonObject } from "@/lib/http";
import { completeOnboarding } from "@/lib/services/onboarding";

// Resolves the session from cookies and writes; never statically cached.
export const dynamic = "force-dynamic";

/**
 * `POST /api/onboarding/complete` — promote a draft into a live household
 * (design/06 § 7, design/04 § 4.2).
 *
 * Atomic + idempotent (handled by the `complete_onboarding` SQL function via the
 * `onboarding` service): creates the household, preferences, optional owner food
 * prefs, and the owner membership, then marks the draft `completed`. Thin
 * boundary: parse the body, delegate to the service, serialize. `201 Created`
 * with `{ householdId, status }`; the client then redirects to Today (Flow 1).
 * `withErrorBoundary` maps any throw to the standard envelope —
 * `VALIDATION_ERROR` (incomplete draft), `NOT_FOUND`, or `CONFLICT`.
 */
export const POST = withErrorBoundary(async (request: Request) => {
  const body = await readJsonObject(request);
  const result = await completeOnboarding(body);
  return Response.json(result, { status: 201 });
});
