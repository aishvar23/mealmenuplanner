import { withErrorBoundary } from "@/lib/errors";
import { listMembers } from "@/lib/services/household";

// Resolves the session from cookies; never statically cached.
export const dynamic = "force-dynamic";

// Next 16 passes dynamic route params as a Promise.
type RouteContext = { params: Promise<{ householdId: string }> };

/**
 * `GET /api/households/{householdId}/members` — list members (design/04 § 4.4).
 *
 * Returns the household's active roster (the `{ data, page }` collection
 * envelope; a bounded set, so no cursor). The service gates on active membership
 * and surfaces a non-member as `NOT_FOUND` (existence-hiding, design/04 § 2),
 * then reads display names through the `list_household_members` safe-projection
 * RPC; RLS / the RPC's own membership check re-validate.
 */
export const GET = withErrorBoundary(
  async (_request: Request, context: RouteContext) => {
    const { householdId } = await context.params;
    const members = await listMembers(householdId);
    return Response.json(members, { status: 200 });
  },
);
