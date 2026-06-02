import { withErrorBoundary } from "@/lib/errors";
import { getGroceryScreen } from "@/lib/services/grocery";

// Resolves the session and reads household-scoped data; never statically cached.
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ householdId: string }> };

/**
 * `GET /api/households/{householdId}/grocery-list/current` — the grocery screen
 * for the household's **current** plan, resolved server-side (design/10 § 6).
 *
 * The plain `grocery-list` GET needs an explicit `mealPlanId`; the web page knows
 * it because it resolves the current plan in a React Server Component
 * (`getGroceryScreen`). The mobile client has no such context, so this endpoint
 * exposes the same one-call resolution: `{ plan, list }`, where `plan` is the
 * active plan covering today (null if none) and `list` is its grocery list (null
 * if the plan has no list generated yet — the client then offers "regenerate").
 * Member-gated in the service (404 for a non-member).
 */
export const GET = withErrorBoundary(
  async (_request: Request, context: RouteContext) => {
    const { householdId } = await context.params;
    return Response.json(await getGroceryScreen(householdId));
  },
);
