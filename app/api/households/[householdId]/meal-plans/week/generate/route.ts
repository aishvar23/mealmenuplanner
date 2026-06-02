import { withErrorBoundary } from "@/lib/errors";
import { readJsonObject } from "@/lib/http";
import { withIdempotency } from "@/lib/services/idempotency";
import {
  generateWeek,
  requireHouseholdPermission,
  validateWeekRequest,
} from "@/lib/services/meal-plan";

// Resolves the session from cookies and writes meal_plan_items; never cached.
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ householdId: string }> };

/**
 * `POST /api/households/{householdId}/meal-plans/week/generate` — generate a
 * weekly plan (design/04 § 4.5, design/08 § 3). Body: `{ startDate, endDate }`.
 * Gated by `can_change_weekly_schedule`; walks each `(date, meals_to_plan slot)`
 * cell, skipping locked and eating-out cells and excluding dishes already chosen
 * this run. Returns the plan summary and total item count.
 *
 * Honors `Idempotency-Key` (design/04 § 3): a retry with the same key replays the
 * stored response instead of generating a second weekly plan.
 */
export const POST = withErrorBoundary(
  async (request: Request, context: RouteContext) => {
    const { householdId } = await context.params;
    const body = await readJsonObject(request);
    const { startDate, endDate } = validateWeekRequest(body);
    return withIdempotency({
      householdId,
      key: request.headers.get("idempotency-key"),
      endpoint: "meal-plans/week/generate",
      request: { startDate, endDate },
      successStatus: 201,
      run: () => generateWeek(householdId, startDate, endDate),
      authorize: () =>
        requireHouseholdPermission(
          householdId,
          "can_change_weekly_schedule",
          "You don't have permission to change the weekly schedule.",
        ),
    });
  },
);
