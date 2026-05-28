import { withErrorBoundary } from "@/lib/errors";
import { listItemCandidates } from "@/lib/services/meal-plan";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ mealPlanItemId: string }> };

/**
 * `GET /api/meal-plan-items/{mealPlanItemId}/candidates` — the eligible
 * replacement dishes for a cell (BUG-022/023). Authorizes the caller for the item
 * (same date-aware `can_change_*` gate as the replace action), then returns every
 * slot-eligible candidate (minus the dish already in the cell) so the
 * single-select picker can list the full set. Read-only; commits happen via the
 * existing `POST .../replace`.
 */
export const GET = withErrorBoundary(
  async (_request: Request, context: RouteContext) => {
    const { mealPlanItemId } = await context.params;
    const candidates = await listItemCandidates(mealPlanItemId);
    return Response.json({ candidates }, { status: 200 });
  },
);
