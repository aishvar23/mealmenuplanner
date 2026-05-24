import { withErrorBoundary } from "@/lib/errors";
import { boundedCollection, readJsonObject } from "@/lib/http";
import {
  createDish,
  listDishes,
  parseDishListFilters,
} from "@/lib/services/admin";

// Resolves the operator session from cookies; never statically cached.
export const dynamic = "force-dynamic";

/**
 * `GET /api/admin/dishes` — list dishes for the operator console (docs/06, P3-2).
 * Supports `search`, `cuisine`, `mealSlot`, `dietType`, `status`, and
 * `missingMetadata` query filters; returns the bounded `{ data, page }` envelope.
 * Gated (operator-only) inside `listDishes` via `requireAdmin`.
 */
export const GET = withErrorBoundary(async (request: Request) => {
  const filters = parseDishListFilters(new URL(request.url).searchParams);
  const dishes = await listDishes(filters);
  return Response.json(boundedCollection(dishes), { status: 200 });
});

/**
 * `POST /api/admin/dishes` — create a dish (always starts `draft`, P3-3).
 */
export const POST = withErrorBoundary(async (request: Request) => {
  const body = await readJsonObject(request);
  const dish = await createDish(body);
  return Response.json(dish, { status: 201 });
});
