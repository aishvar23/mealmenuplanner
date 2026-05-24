import { withErrorBoundary } from "@/lib/errors";
import { boundedCollection, readJsonObject } from "@/lib/http";
import { addDishIngredient, listDishIngredients } from "@/lib/services/admin";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ dishId: string }> };

/** `GET /api/admin/dishes/{dishId}/ingredients` — the dish's ingredient links (P3-5). */
export const GET = withErrorBoundary(
  async (_request: Request, context: RouteContext) => {
    const { dishId } = await context.params;
    const ingredients = await listDishIngredients(dishId);
    return Response.json(boundedCollection(ingredients), { status: 200 });
  },
);

/** `POST /api/admin/dishes/{dishId}/ingredients` — add an ingredient to the dish (P3-5). */
export const POST = withErrorBoundary(
  async (request: Request, context: RouteContext) => {
    const { dishId } = await context.params;
    const body = await readJsonObject(request);
    const link = await addDishIngredient(dishId, body);
    return Response.json(link, { status: 201 });
  },
);
