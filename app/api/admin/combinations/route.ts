import { Constants } from "@/lib/db/database.types";
import { withErrorBoundary } from "@/lib/errors";
import { boundedCollection } from "@/lib/http";
import { listCombinations } from "@/lib/services/admin";

// Resolves the operator session from cookies; never statically cached.
export const dynamic = "force-dynamic";

const COMBINATION_STATUSES = Constants.public.Enums.combination_status;

/**
 * `GET /api/admin/combinations` — list meal combinations for the operator review
 * queue (P10-5). Optional `status` query param (default `proposed`); an unknown
 * value falls back to `proposed`. Returns the bounded `{ data, page }` envelope.
 * Gated (operator-only) inside `listCombinations` via `requireAdmin`.
 */
export const GET = withErrorBoundary(async (request: Request) => {
  const requested = new URL(request.url).searchParams.get("status");
  const status = (COMBINATION_STATUSES as readonly string[]).includes(
    requested ?? "",
  )
    ? (requested as (typeof COMBINATION_STATUSES)[number])
    : "proposed";

  const combinations = await listCombinations(status);
  return Response.json(boundedCollection(combinations), { status: 200 });
});
