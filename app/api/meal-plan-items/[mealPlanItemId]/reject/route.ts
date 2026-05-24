import { withErrorBoundary } from "@/lib/errors";
import { readJsonObject } from "@/lib/http";
import { rejectItem, validateRejectRequest } from "@/lib/services/meal-plan";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ mealPlanItemId: string }> };

/**
 * `POST /api/meal-plan-items/{mealPlanItemId}/reject` — reject a suggestion with
 * a reason (design/08 § 2, Flow 4). Body: `{ feedbackType, reason? }`. Records
 * `meal_feedback` (which the recommender reads to penalize the dish; a
 * `do_not_suggest_again` becomes a hard exclude), marks the item `rejected`, and
 * returns ranked alternatives for the replace step. Gated by
 * `can_change_today_menu`.
 */
export const POST = withErrorBoundary(
  async (request: Request, context: RouteContext) => {
    const { mealPlanItemId } = await context.params;
    const body = await readJsonObject(request);
    const input = validateRejectRequest(body);
    const result = await rejectItem(mealPlanItemId, input);
    return Response.json(result, { status: 200 });
  },
);
