import { withErrorBoundary } from "@/lib/errors";
import { readJsonObject } from "@/lib/http";
import { overrideResponse } from "@/lib/services/provider";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ responseId: string }> };

/**
 * `POST /api/provider-responses/{responseId}/provider-override` — the owner corrects a
 * locked member response after cutoff (MP-A-150; UC-OVERRIDE-001, BR-007). Requires a
 * mandatory reason + the corrected order; the service/RPC enforce owner-only,
 * day-locked, and menu derivation, preserve the prior order in the audit, and mark the
 * day's current preparation batch stale. Returns the `ProviderOverrideResultDto`.
 */
export const POST = withErrorBoundary(
  async (request: Request, context: RouteContext) => {
    const { responseId } = await context.params;
    const body = await readJsonObject(request);
    return Response.json(await overrideResponse(responseId, body), {
      status: 200,
    });
  },
);
