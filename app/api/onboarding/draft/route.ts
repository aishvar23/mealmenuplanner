import { withErrorBoundary } from "@/lib/errors";
import { readJsonObject } from "@/lib/http";
import { getDraft, saveDraft } from "@/lib/services/onboarding";

// Resolves the session from cookies and writes; never statically cached.
export const dynamic = "force-dynamic";

/**
 * `GET /api/onboarding/draft` — load / resume detection (design/06 § 6/§ 9).
 *
 * Returns the caller's single `in_progress` draft, or `null` when none exists
 * (the client then starts a fresh wizard). Thin boundary: delegate to the
 * `onboarding` service and serialize; `withErrorBoundary` maps any throw to the
 * standard envelope.
 */
export const GET = withErrorBoundary(async () => {
  const draft = await getDraft();
  return Response.json(draft, { status: 200 });
});

/**
 * `PUT /api/onboarding/draft` — autosave (design/06 § 5/§ 9).
 *
 * Idempotent upsert of the caller's single `in_progress` draft (created on first
 * call). The service recomputes `completionPercentage` and re-stamps
 * `lastSavedAt`, then returns the saved draft (same shape as `GET`). A `409`
 * (envelope) signals a lost in-progress race — the client re-`GET`s to reconcile.
 */
export const PUT = withErrorBoundary(async (request: Request) => {
  const body = await readJsonObject(request);
  const draft = await saveDraft(body);
  return Response.json(draft, { status: 200 });
});
