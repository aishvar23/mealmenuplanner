import { withErrorBoundary } from "@/lib/errors";
import { readJsonObject } from "@/lib/http";
import { updateMyFoodPreferences } from "@/lib/services/household";

// Resolves the session from cookies and writes; never statically cached.
export const dynamic = "force-dynamic";

// Next 16 passes dynamic route params as a Promise.
type RouteContext = { params: Promise<{ householdId: string }> };

/**
 * `PATCH /api/households/{householdId}/food-preferences` — update the caller's
 * own member-level food preferences (currently the preferred dishes, BUG-006).
 *
 * The member-scoped counterpart to `PATCH .../preferences` (which is
 * household-scoped). Self-write: a member always edits their own preferences, so
 * this is gated by active membership rather than a `can_*` flag. The service
 * validates the body and upserts the caller's `user_food_preferences` row under
 * the per-request RLS client; `withErrorBoundary` maps any throw to the standard
 * envelope.
 */
export const PATCH = withErrorBoundary(
  async (request: Request, context: RouteContext) => {
    const { householdId } = await context.params;
    const body = await readJsonObject(request);
    const preferences = await updateMyFoodPreferences(householdId, body);
    return Response.json(preferences, { status: 200 });
  },
);
