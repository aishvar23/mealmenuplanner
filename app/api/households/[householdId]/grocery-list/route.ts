import { withErrorBoundary } from "@/lib/errors";
import { getGroceryList } from "@/lib/services/grocery";

// Resolves the session from cookies and reads household-scoped data; never cached.
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ householdId: string }> };

/**
 * `GET /api/households/{householdId}/grocery-list?mealPlanId={mealPlanId}` — the
 * plan's grocery list (design/04 § 4.6). Member-gated in the service (404 for a
 * non-member); a missing/invalid `mealPlanId` is a 400, no list yet is a 404.
 */
export const GET = withErrorBoundary(
  async (request: Request, context: RouteContext) => {
    const { householdId } = await context.params;
    const mealPlanId = new URL(request.url).searchParams.get("mealPlanId");
    const result = await getGroceryList(householdId, mealPlanId ?? "");
    return Response.json(result);
  },
);
