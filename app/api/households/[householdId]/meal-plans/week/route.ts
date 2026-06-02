import { withErrorBoundary } from "@/lib/errors";
import { getWeekPlan, validateWeekRequest } from "@/lib/services/meal-plan";

// Resolves the session and reads household-scoped data; never statically cached.
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ householdId: string }> };

/**
 * `GET /api/households/{householdId}/meal-plans/week?startDate=&endDate=` — the
 * planned items across a date range, ordered by date then slot (design/04 § 4.5;
 * design/10 § 6 "Week: view"). Both bounds are required real calendar dates with
 * `endDate >= startDate` and a span at most `MAX_PLAN_RANGE_DAYS` days — the rule
 * is shared with weekly generation via `validateWeekRequest`, so the read and the
 * write can never drift.
 *
 * Like the today read, the web renders this server-side via `getWeekPlan`; the
 * mobile client reads the existing plan here. Member-gated in the service (404
 * for a non-member); a malformed/out-of-range window is a 400.
 */
export const GET = withErrorBoundary(
  async (request: Request, context: RouteContext) => {
    const { householdId } = await context.params;
    const params = new URL(request.url).searchParams;
    const { startDate, endDate } = validateWeekRequest({
      startDate: params.get("startDate"),
      endDate: params.get("endDate"),
    });
    return Response.json(await getWeekPlan(householdId, startDate, endDate));
  },
);
