import { withErrorBoundary } from "@/lib/errors";
import { readJsonObject } from "@/lib/http";
import { getDish, updateDish } from "@/lib/services/admin";

export const dynamic = "force-dynamic";

// Next 16 passes dynamic route params as a Promise.
type RouteContext = { params: Promise<{ dishId: string }> };

/**
 * `GET /api/admin/dishes/{dishId}` — full dish detail: the dish plus its
 * ingredients, prep tasks, pairings, and the activation quality checklist
 * (docs/06, P3-3/8).
 */
export const GET = withErrorBoundary(
  async (_request: Request, context: RouteContext) => {
    const { dishId } = await context.params;
    const detail = await getDish(dishId);
    return Response.json(detail, { status: 200 });
  },
);

/**
 * `PATCH /api/admin/dishes/{dishId}` — partial dish update (P3-3). Status is not
 * editable here; activation/archival is the dedicated `/status` action.
 */
export const PATCH = withErrorBoundary(
  async (request: Request, context: RouteContext) => {
    const { dishId } = await context.params;
    const body = await readJsonObject(request);
    const dish = await updateDish(dishId, body);
    return Response.json(dish, { status: 200 });
  },
);
