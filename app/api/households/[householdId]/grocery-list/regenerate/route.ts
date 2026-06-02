import { withErrorBoundary } from "@/lib/errors";
import { readJsonObject } from "@/lib/http";
import {
  regenerateGroceryList,
  validateRegenerateRequest,
} from "@/lib/services/grocery";
import { withIdempotency } from "@/lib/services/idempotency";
// Imported from the lightweight access module (not the `meal-plan` barrel) so the
// grocery route doesn't transitively pull in the recommendation/generation engine.
import { requireHouseholdPermission } from "@/lib/services/meal-plan/access";

// Resolves the session from cookies and writes the grocery list; never cached.
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ householdId: string }> };

/**
 * `POST /api/households/{householdId}/grocery-list/regenerate` — rebuild the
 * plan's grocery list from current `meal_plan_items` (design/04 § 4.6,
 * design/08 § 10). Body: `{ mealPlanId }`. Gated by `can_manage_grocery_list` in
 * the service; idempotent (one list per plan). Returns the full list (same shape
 * as the GET).
 *
 * Honors `Idempotency-Key` (design/04 § 3): a retry with the same key replays the
 * stored response instead of rebuilding the list a second time.
 */
export const POST = withErrorBoundary(
  async (request: Request, context: RouteContext) => {
    const { householdId } = await context.params;
    const body = await readJsonObject(request);
    const { mealPlanId } = validateRegenerateRequest(body);
    return withIdempotency({
      householdId,
      key: request.headers.get("idempotency-key"),
      endpoint: "grocery-list/regenerate",
      request: { mealPlanId },
      successStatus: 200,
      run: () => regenerateGroceryList(householdId, mealPlanId),
      authorize: () =>
        requireHouseholdPermission(
          householdId,
          "can_manage_grocery_list",
          "You don't have permission to manage the grocery list.",
        ),
    });
  },
);
