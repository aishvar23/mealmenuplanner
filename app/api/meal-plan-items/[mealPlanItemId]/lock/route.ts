import { withErrorBoundary } from "@/lib/errors";
import { lockItem } from "@/lib/services/meal-plan";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ mealPlanItemId: string }> };

/**
 * `POST /api/meal-plan-items/{mealPlanItemId}/lock` — lock the cell so
 * regeneration never overwrites it (design/04 § 4.5, design/08 § 7). Gated by
 * `can_change_today_menu`. Returns the updated item.
 */
export const POST = withErrorBoundary(
  async (_request: Request, context: RouteContext) => {
    const { mealPlanItemId } = await context.params;
    const item = await lockItem(mealPlanItemId);
    return Response.json(item, { status: 200 });
  },
);
