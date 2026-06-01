import { withErrorBoundary } from "@/lib/errors";
import {
  deleteHousehold,
  getHousehold,
  listUserHouseholds,
} from "@/lib/services/household";

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

/**
 * `DELETE /api/households/{householdId}` — permanently delete a household (BETA).
 * Owner-only (the service's RPC re-checks); cascades to all household-scoped data.
 * Returns the caller's remaining households so the switcher can update in place.
 */
export const DELETE = withErrorBoundary(
  async (_request: Request, context: RouteContext) => {
    const { householdId } = await context.params;
    await deleteHousehold(householdId);
    return Response.json(
      { households: await listUserHouseholds() },
      {
        status: 200,
      },
    );
  },
);
