import { withErrorBoundary } from "@/lib/errors";
import { markEatingOut } from "@/lib/services/meal-plan";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ mealPlanItemId: string }> };

/**
 * `POST /api/meal-plan-items/{mealPlanItemId}/eating-out` — mark the slot as
 * eating out (design/04 § 4.5, design/08 § 6, Flow 5). Clears the dish and sets
 * `eating_out`, which is deliberately excluded from rotation and grocery
 * aggregation. Gated by `can_change_today_menu`; 409 if locked.
 */
export const POST = withErrorBoundary(
  async (_request: Request, context: RouteContext) => {
    const { mealPlanItemId } = await context.params;
    const item = await markEatingOut(mealPlanItemId);
    return Response.json(item, { status: 200 });
  },
);
