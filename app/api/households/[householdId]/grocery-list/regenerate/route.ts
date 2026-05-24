import { withErrorBoundary } from "@/lib/errors";
import { readJsonObject } from "@/lib/http";
import {
  regenerateGroceryList,
  validateRegenerateRequest,
} from "@/lib/services/grocery";

// Resolves the session from cookies and writes the grocery list; never cached.
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ householdId: string }> };

/**
 * `POST /api/households/{householdId}/grocery-list/regenerate` — rebuild the
 * plan's grocery list from current `meal_plan_items` (design/04 § 4.6,
 * design/08 § 10). Body: `{ mealPlanId }`. Gated by `can_manage_grocery_list` in
 * the service; idempotent (one list per plan). Returns the full list (same shape
 * as the GET).
 */
export const POST = withErrorBoundary(
  async (request: Request, context: RouteContext) => {
    const { householdId } = await context.params;
    const body = await readJsonObject(request);
    const { mealPlanId } = validateRegenerateRequest(body);
    const result = await regenerateGroceryList(householdId, mealPlanId);
    return Response.json(result);
  },
);
