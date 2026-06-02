import { withErrorBoundary } from "@/lib/errors";
import { readJsonObject } from "@/lib/http";
import { withIdempotency } from "@/lib/services/idempotency";
import {
  generateToday,
  requireHouseholdPermission,
  validateTodayRequest,
} from "@/lib/services/meal-plan";

// Resolves the session from cookies and writes meal_plan_items; never cached.
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ householdId: string }> };

/**
 * `POST /api/households/{householdId}/meal-plans/today/generate` — generate
 * today's meal for one slot (design/04 § 4.5, design/08 § 2). Body:
 * `{ date, mealSlot }`. Gated by `can_change_today_menu` in the service; runs the
 * recommender and upserts the slot's `meal_plan_items` row. Returns the suggested
 * item plus runner-up alternatives so the client can offer "Suggest another".
 *
 * Honors `Idempotency-Key` (design/04 § 3): a retry with the same key replays the
 * stored response instead of generating a second suggestion.
 */
export const POST = withErrorBoundary(
  async (request: Request, context: RouteContext) => {
    const { householdId } = await context.params;
    const body = await readJsonObject(request);
    const { date, mealSlot } = validateTodayRequest(body);
    return withIdempotency({
      householdId,
      key: request.headers.get("idempotency-key"),
      endpoint: "meal-plans/today/generate",
      request: { date, mealSlot },
      successStatus: 201,
      run: () => generateToday(householdId, date, mealSlot),
      authorize: () =>
        requireHouseholdPermission(
          householdId,
          "can_change_today_menu",
          "You don't have permission to change today's menu.",
        ),
    });
  },
);
