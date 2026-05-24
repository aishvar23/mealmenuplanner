import { withErrorBoundary } from "@/lib/errors";
import { leaveHousehold } from "@/lib/services/household";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ householdId: string }> };

/**
 * `POST /api/households/{householdId}/leave` — leave the household (design/04
 * § 4.4, design/07 § 11). Any active member acting on self (`active → left`). An
 * owner must transfer ownership first (CONFLICT otherwise). Returns
 * `{ householdId, status: "left" }`.
 */
export const POST = withErrorBoundary(
  async (_request: Request, context: RouteContext) => {
    const { householdId } = await context.params;
    const result = await leaveHousehold(householdId);
    return Response.json(result, { status: 200 });
  },
);
