import { withErrorBoundary } from "@/lib/errors";
import { suggestAnotherItem } from "@/lib/services/meal-plan";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ mealPlanItemId: string }> };

/**
 * `POST /api/meal-plan-items/{mealPlanItemId}/suggest-another` — re-suggest the
 * slot, excluding the current dish, and overwrite the cell in place (design/08
 * § 2, no feedback recorded). Gated by `can_change_today_menu`. Returns the new
 * suggestion plus alternatives.
 */
export const POST = withErrorBoundary(
  async (_request: Request, context: RouteContext) => {
    const { mealPlanItemId } = await context.params;
    const result = await suggestAnotherItem(mealPlanItemId);
    return Response.json(result, { status: 200 });
  },
);
