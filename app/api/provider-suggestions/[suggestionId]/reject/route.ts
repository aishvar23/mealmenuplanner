import { withErrorBoundary } from "@/lib/errors";
import { readOptionalJsonObject } from "@/lib/http";
import { rejectSuggestion } from "@/lib/services/provider";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ suggestionId: string }> };

/**
 * `POST /api/provider-suggestions/{suggestionId}/reject` — the owner rejects a
 * pending suggestion (MP-A-131; UC-SUGGEST-003). The body is optional
 * (`ResolveProviderSuggestionRequest` — an owner note). Owner-only via RLS (a
 * non-owner 404s); re-resolving is `409 { reason: "suggestion_not_pending" }`.
 * Returns the updated `ProviderSuggestionDto`.
 */
export const POST = withErrorBoundary(
  async (request: Request, context: RouteContext) => {
    const { suggestionId } = await context.params;
    const body = await readOptionalJsonObject(request);
    return Response.json(await rejectSuggestion(suggestionId, body), {
      status: 200,
    });
  },
);
