import { ValidationError, withErrorBoundary } from "@/lib/errors";
import { getDayPlan, isCalendarDate } from "@/lib/services/meal-plan";

// Resolves the session and reads household-scoped data; never statically cached.
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ householdId: string }> };

/**
 * `GET /api/households/{householdId}/meal-plans/today?date=YYYY-MM-DD` — the
 * planned items for a single day, ordered by slot (design/04 § 4.5; design/10
 * § 6 "Today: view"). `date` is optional and defaults to today (UTC).
 *
 * The web app renders this server-side via `getDayPlan` in a React Server
 * Component, so it never needed an HTTP route; the mobile client reads the
 * existing plan through this endpoint instead of re-`generate`-ing (which would
 * create a fresh suggestion). Member-gated in the service (404 for a non-member);
 * a malformed `date` is a 400.
 */
export const GET = withErrorBoundary(
  async (request: Request, context: RouteContext) => {
    const { householdId } = await context.params;
    const date =
      new URL(request.url).searchParams.get("date") ??
      new Date().toISOString().slice(0, 10);
    if (!isCalendarDate(date)) {
      throw new ValidationError("Invalid date.", [
        { field: "date", rule: "date", message: "Expected YYYY-MM-DD." },
      ]);
    }
    return Response.json(await getDayPlan(householdId, date));
  },
);
