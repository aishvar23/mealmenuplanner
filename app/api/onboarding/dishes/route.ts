import { withErrorBoundary } from "@/lib/errors";
import { listDishCatalog } from "@/lib/services/onboarding";

// Reads the session from cookies; never statically cached.
export const dynamic = "force-dynamic";

/**
 * `GET /api/onboarding/dishes?diet=<diet_type>` — the dish catalog for the
 * preferred-dish onboarding step (BUG-006, PREFDISH-001..003).
 *
 * Returns active, standalone-eligible dishes the household can mark as favourites,
 * narrowed to the household's chosen diet when `diet` is supplied. Thin boundary:
 * delegate to the `onboarding` service; `withErrorBoundary` maps throws to the
 * standard envelope (including `UnauthenticatedError` → 401).
 */
export const GET = withErrorBoundary(async (request: Request) => {
  const diet = new URL(request.url).searchParams.get("diet");
  const dishes = await listDishCatalog(diet);
  return Response.json(dishes, { status: 200 });
});
