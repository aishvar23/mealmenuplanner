import { withErrorBoundary } from "@/lib/errors";
import { readOptionalJsonObject } from "@/lib/http";
import { acceptSuggestionAsOption } from "@/lib/services/provider";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ suggestionId: string }> };

/**
 * `POST /api/provider-suggestions/{suggestionId}/accept-as-option` — the owner
 * marks a pending suggestion accepted (MP-A-131; UC-SUGGEST-002). The body is
 * optional (`ResolveProviderSuggestionRequest` — an owner note). Owner-only via
 * RLS (a non-owner 404s); re-resolving is `409 { reason: "suggestion_not_pending" }`.
 * Returns the updated `ProviderSuggestionDto`.
 */
export const POST = withErrorBoundary(
  async (request: Request, context: RouteContext) => {
    const { suggestionId } = await context.params;
    const body = await readOptionalJsonObject(request);
    return Response.json(await acceptSuggestionAsOption(suggestionId, body), {
      status: 200,
    });
  },
);
