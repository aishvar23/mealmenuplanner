import { withErrorBoundary } from "@/lib/errors";
import { boundedCollection, readJsonObject } from "@/lib/http";
import {
  createIngredient,
  listIngredients,
  type IngredientListFilters,
} from "@/lib/services/admin";

export const dynamic = "force-dynamic";

/**
 * `GET /api/admin/ingredients` — the ingredient catalog (docs/06, P3-4).
 * Supports `search` (name substring) and `category` filters; returns the bounded
 * `{ data, page }` envelope. Operator-gated inside the service.
 */
export const GET = withErrorBoundary(async (request: Request) => {
  const params = new URL(request.url).searchParams;
  const filters: IngredientListFilters = {};
  const search = params.get("search")?.trim();
  if (search) filters.search = search;
  const category = params.get("category")?.trim();
  if (category) filters.category = category;

  const ingredients = await listIngredients(filters);
  return Response.json(boundedCollection(ingredients), { status: 200 });
});

/** `POST /api/admin/ingredients` — create an ingredient (P3-4). */
export const POST = withErrorBoundary(async (request: Request) => {
  const body = await readJsonObject(request);
  const ingredient = await createIngredient(body);
  return Response.json(ingredient, { status: 201 });
});
