import { withErrorBoundary } from "@/lib/errors";
import { listCombinationCatalog } from "@/lib/services/onboarding";

// Reads the session from cookies; never statically cached.
export const dynamic = "force-dynamic";

/**
 * `GET /api/onboarding/combinations?diet=<diet_type>` — the meal-combination
 * catalog for the "Select combinations" onboarding mode (P10).
 *
 * Returns active, popularity-ranked admin combos with their member dishes,
 * narrowed to the household's diet when `diet` is supplied. Thin boundary:
 * delegate to the `onboarding` service; `withErrorBoundary` maps throws to the
 * standard envelope (including `UnauthenticatedError` → 401).
 */
export const GET = withErrorBoundary(async (request: Request) => {
  const diet = new URL(request.url).searchParams.get("diet");
  const combinations = await listCombinationCatalog(diet);
  return Response.json(combinations, { status: 200 });
});
