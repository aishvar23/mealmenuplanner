import { withErrorBoundary } from "@/lib/errors";
import { readJsonObject } from "@/lib/http";
import { createSuggestion, listSuggestions } from "@/lib/services/provider";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ menuDayId: string }> };

/**
 * `GET /api/provider-menu-days/{menuDayId}/suggestions` — list the suggestions the
 * caller may see for the day (MP-A-131). RLS scopes it: the owner sees all
 * suggestions filed against the day (triage); a member sees only their own. Returns
 * `ProviderSuggestionDto[]` (newest-first; `[]` when none or no access).
 */
export const GET = withErrorBoundary(
  async (_request: Request, context: RouteContext) => {
    const { menuDayId } = await context.params;
    return Response.json(await listSuggestions(menuDayId));
  },
);

/**
 * `POST /api/provider-menu-days/{menuDayId}/suggestions` — the caller files a
 * non-binding meal suggestion for the day (MP-A-131; UC-SUGGEST-001). Body:
 * `CreateProviderSuggestionRequest`. The author + provider are server-derived; a
 * day the caller can't see is an existence-hiding 404. Rate-limited
 * (`429 RATE_LIMITED`). Returns the created `ProviderSuggestionDto`.
 */
export const POST = withErrorBoundary(
  async (request: Request, context: RouteContext) => {
    const { menuDayId } = await context.params;
    const body = await readJsonObject(request);
    return Response.json(await createSuggestion(menuDayId, body), {
      status: 201,
    });
  },
);
