import { withErrorBoundary } from "@/lib/errors";
import { readJsonObject } from "@/lib/http";
import { updatePreferences } from "@/lib/services/household";

// Resolves the session from cookies and writes; never statically cached.
export const dynamic = "force-dynamic";

// Next 16 passes dynamic route params as a Promise.
type RouteContext = { params: Promise<{ householdId: string }> };

/**
 * `PATCH /api/households/{householdId}/preferences` — update preferences
 * (design/04 § 4.1).
 *
 * Partial update of any subset of preference fields, gated by
 * `can_edit_household_preferences`. Returns the full updated preferences object
 * (same shape as the `preferences` block of the household read). The service
 * validates the body, enforces the permission, and runs under the per-request
 * RLS client; `withErrorBoundary` maps any throw to the standard envelope.
 */
export const PATCH = withErrorBoundary(
  async (request: Request, context: RouteContext) => {
    const { householdId } = await context.params;
    const body = await readJsonObject(request);
    const preferences = await updatePreferences(householdId, body);
    return Response.json(preferences, { status: 200 });
  },
);
