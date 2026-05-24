import { withErrorBoundary } from "@/lib/errors";
import { acceptItem } from "@/lib/services/meal-plan";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ mealPlanItemId: string }> };

/**
 * `POST /api/meal-plan-items/{mealPlanItemId}/accept` — accept the suggested meal
 * (design/08 § 2, `suggested → accepted`). Gated by `can_change_today_menu`
 * resolved from the item's household. Returns the updated item.
 */
export const POST = withErrorBoundary(
  async (_request: Request, context: RouteContext) => {
    const { mealPlanItemId } = await context.params;
    const item = await acceptItem(mealPlanItemId);
    return Response.json(item, { status: 200 });
  },
);
