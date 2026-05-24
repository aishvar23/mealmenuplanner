import { withErrorBoundary } from "@/lib/errors";
import { readJsonObject } from "@/lib/http";
import {
  removeDishIngredient,
  updateDishIngredient,
} from "@/lib/services/admin";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ dishId: string; dishIngredientId: string }>;
};

/** `PATCH /api/admin/dishes/{dishId}/ingredients/{dishIngredientId}` — edit a link (P3-5). */
export const PATCH = withErrorBoundary(
  async (request: Request, context: RouteContext) => {
    const { dishId, dishIngredientId } = await context.params;
    const body = await readJsonObject(request);
    const link = await updateDishIngredient(dishId, dishIngredientId, body);
    return Response.json(link, { status: 200 });
  },
);

/** `DELETE /api/admin/dishes/{dishId}/ingredients/{dishIngredientId}` — remove a link (P3-5). */
export const DELETE = withErrorBoundary(
  async (_request: Request, context: RouteContext) => {
    const { dishId, dishIngredientId } = await context.params;
    const result = await removeDishIngredient(dishId, dishIngredientId);
    return Response.json(result, { status: 200 });
  },
);
