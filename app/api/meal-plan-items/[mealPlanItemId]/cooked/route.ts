import { withErrorBoundary } from "@/lib/errors";
import { markCookedItem } from "@/lib/services/meal-plan";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ mealPlanItemId: string }> };

/**
 * `POST /api/meal-plan-items/{mealPlanItemId}/cooked` — mark a planned meal as
 * cooked (design/08 § 4, P5-7). A terminal outcome that feeds the
 * variety/rotation history. Gated by `can_change_today_menu`; requires a dish.
 */
export const POST = withErrorBoundary(
  async (_request: Request, context: RouteContext) => {
    const { mealPlanItemId } = await context.params;
    const item = await markCookedItem(mealPlanItemId);
    return Response.json(item, { status: 200 });
  },
);
