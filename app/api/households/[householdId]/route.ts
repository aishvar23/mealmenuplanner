import { withErrorBoundary } from "@/lib/errors";
import { getHousehold } from "@/lib/services/household";

// Resolves the session from cookies; never statically cached.
export const dynamic = "force-dynamic";

// Next 16 passes dynamic route params as a Promise.
type RouteContext = { params: Promise<{ householdId: string }> };

/**
 * `GET /api/households/{householdId}` — read a household (design/04 § 4.1).
 *
 * Returns the household, its preferences, and the caller's own permissions
 * (`currentUserPermissions`). The service gates on active membership and surfaces
 * a non-member as `NOT_FOUND` (existence-hiding, design/04 § 2); RLS re-checks.
 */
export const GET = withErrorBoundary(
  async (_request: Request, context: RouteContext) => {
    const { householdId } = await context.params;
    const household = await getHousehold(householdId);
    return Response.json(household, { status: 200 });
  },
);
