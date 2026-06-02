import { ValidationError, withErrorBoundary } from "@/lib/errors";
import {
  daysBetweenInclusive,
  getWeekPlan,
  isCalendarDate,
  MAX_PLAN_RANGE_DAYS,
} from "@/lib/services/meal-plan";

// Resolves the session and reads household-scoped data; never statically cached.
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ householdId: string }> };

/**
 * `GET /api/households/{householdId}/meal-plans/week?startDate=&endDate=` — the
 * planned items across a date range, ordered by date then slot (design/04 § 4.5;
 * design/10 § 6 "Week: view"). Both bounds are required real calendar dates with
 * `endDate >= startDate` and a span of at most {@link MAX_PLAN_RANGE_DAYS} days,
 * mirroring weekly generation's range rule.
 *
 * Like the today read, the web renders this server-side via `getWeekPlan`; the
 * mobile client reads the existing plan here. Member-gated in the service (404
 * for a non-member); a malformed/out-of-range window is a 400.
 */
export const GET = withErrorBoundary(
  async (request: Request, context: RouteContext) => {
    const { householdId } = await context.params;
    const params = new URL(request.url).searchParams;
    const startDate = params.get("startDate");
    const endDate = params.get("endDate");

    const issues = [];
    if (!isCalendarDate(startDate)) {
      issues.push({
        field: "startDate",
        rule: "date",
        message: "Expected YYYY-MM-DD.",
      });
    }
    if (!isCalendarDate(endDate)) {
      issues.push({
        field: "endDate",
        rule: "date",
        message: "Expected YYYY-MM-DD.",
      });
    }
    if (issues.length > 0) {
      throw new ValidationError("Invalid weekly plan range.", issues);
    }

    const start = startDate as string;
    const end = endDate as string;
    if (end < start) {
      throw new ValidationError("Invalid weekly plan range.", [
        {
          field: "endDate",
          rule: "range",
          message: "endDate must be on or after startDate.",
        },
      ]);
    }
    if (daysBetweenInclusive(start, end) > MAX_PLAN_RANGE_DAYS) {
      throw new ValidationError("Invalid weekly plan range.", [
        {
          field: "endDate",
          rule: "max",
          max: MAX_PLAN_RANGE_DAYS,
          message: `A plan may span at most ${MAX_PLAN_RANGE_DAYS} days.`,
        },
      ]);
    }

    return Response.json(await getWeekPlan(householdId, start, end));
  },
);
