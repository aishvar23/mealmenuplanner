import { withErrorBoundary } from "@/lib/errors";
import { unlockItem } from "@/lib/services/meal-plan";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ mealPlanItemId: string }> };

/**
 * `POST /api/meal-plan-items/{mealPlanItemId}/unlock` — unlock the cell, making
 * it eligible for the next regeneration (design/04 § 4.5, design/08 § 7). Gated
 * by `can_change_today_menu`. Returns the updated item.
 */
export const POST = withErrorBoundary(
  async (_request: Request, context: RouteContext) => {
    const { mealPlanItemId } = await context.params;
    const item = await unlockItem(mealPlanItemId);
    return Response.json(item, { status: 200 });
  },
);
