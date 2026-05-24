import { withErrorBoundary } from "@/lib/errors";
import { readJsonObject } from "@/lib/http";
import { deleteIngredient, updateIngredient } from "@/lib/services/admin";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ ingredientId: string }> };

/** `PATCH /api/admin/ingredients/{ingredientId}` — edit an ingredient (P3-4). */
export const PATCH = withErrorBoundary(
  async (request: Request, context: RouteContext) => {
    const { ingredientId } = await context.params;
    const body = await readJsonObject(request);
    const ingredient = await updateIngredient(ingredientId, body);
    return Response.json(ingredient, { status: 200 });
  },
);

/**
 * `DELETE /api/admin/ingredients/{ingredientId}` — delete an ingredient (P3-4).
 * 409s if the ingredient is still used by a dish (ON DELETE RESTRICT, design/01).
 */
export const DELETE = withErrorBoundary(
  async (_request: Request, context: RouteContext) => {
    const { ingredientId } = await context.params;
    const result = await deleteIngredient(ingredientId);
    return Response.json(result, { status: 200 });
  },
);
