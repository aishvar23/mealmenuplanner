import { withErrorBoundary } from "@/lib/errors";
import { listAccompanimentCatalog } from "@/lib/services/onboarding";

// Reads the session from cookies; never statically cached.
export const dynamic = "force-dynamic";

/**
 * `GET /api/onboarding/accompaniments?diet=<diet_type>&search=<term>` — the full
 * active, diet-compatible dish catalog (all roles) for the "Goes with" picker in
 * `build` mode (P10). Optional `search` narrows by dish name. Thin boundary:
 * delegate to the `onboarding` service; `withErrorBoundary` maps throws to the
 * standard envelope.
 */
export const GET = withErrorBoundary(async (request: Request) => {
  const params = new URL(request.url).searchParams;
  const diet = params.get("diet");
  const search = params.get("search");
  const dishes = await listAccompanimentCatalog(diet, search);
  return Response.json(dishes, { status: 200 });
});
