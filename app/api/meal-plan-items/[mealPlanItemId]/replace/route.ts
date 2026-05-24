import { withErrorBoundary } from "@/lib/errors";
import { readJsonObject } from "@/lib/http";
import { replaceItem, validateReplaceRequest } from "@/lib/services/meal-plan";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ mealPlanItemId: string }> };

/**
 * `POST /api/meal-plan-items/{mealPlanItemId}/replace` — replace a meal (design/04
 * § 4.5, design/08 § 5, Flow 4). Body: `{ replacementDishId?, reason?,
 * feedbackType? }`. Validates the chosen dish is eligible for the slot (or picks
 * one when omitted), records feedback if a reason came in, swaps the dish, and
 * sets the cell `accepted`. Gated by `can_change_today_menu`; 409 if locked.
 */
export const POST = withErrorBoundary(
  async (request: Request, context: RouteContext) => {
    const { mealPlanItemId } = await context.params;
    const body = await readJsonObject(request);
    const input = validateReplaceRequest(body);
    const result = await replaceItem(mealPlanItemId, input);
    return Response.json(result, { status: 200 });
  },
);
