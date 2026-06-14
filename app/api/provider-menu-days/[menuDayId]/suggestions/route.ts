import { withErrorBoundary } from "@/lib/errors";
import { readJsonObject } from "@/lib/http";
import { createSuggestion } from "@/lib/services/provider";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ menuDayId: string }> };

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
