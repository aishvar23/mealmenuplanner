import { ValidationError, withErrorBoundary } from "@/lib/errors";
import { getGroceryScreen } from "@/lib/services/grocery";
import { isCalendarDate } from "@/lib/services/recommendation/validate";

// Resolves the session and reads household-scoped data; never statically cached.
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ householdId: string }> };

/**
 * `GET /api/households/{householdId}/grocery-list/current?date=YYYY-MM-DD` — the
 * grocery screen for the household's **current** plan, resolved server-side
 * (design/10 § 6).
 *
 * The plain `grocery-list` GET needs an explicit `mealPlanId`; the web page knows
 * it because it resolves the current plan in a React Server Component
 * (`getGroceryScreen`). The mobile client has no such context, so this endpoint
 * exposes the same one-call resolution: `{ plan, list }`, where `plan` is the
 * active plan covering today (null if none) and `list` is its grocery list (null
 * if the plan has no list generated yet — the client then offers "regenerate").
 * Member-gated in the service (404 for a non-member).
 *
 * `date` is optional and is the caller's calendar day; the mobile client sends
 * its device-local day so this resolves the same "today" the Today/Week screens
 * use (otherwise the screens could disagree across a timezone/midnight boundary).
 * It defaults to the server's UTC day; a malformed `date` is a 400.
 */
export const GET = withErrorBoundary(
  async (request: Request, context: RouteContext) => {
    const { householdId } = await context.params;
    const date = new URL(request.url).searchParams.get("date");
    if (date !== null && !isCalendarDate(date)) {
      throw new ValidationError("Invalid date.", [
        { field: "date", rule: "date", message: "Expected YYYY-MM-DD." },
      ]);
    }
    return Response.json(
      date === null
        ? await getGroceryScreen(householdId)
        : await getGroceryScreen(householdId, date),
    );
  },
);
