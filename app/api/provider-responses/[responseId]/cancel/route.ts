import { withErrorBoundary } from "@/lib/errors";
import { cancelMyResponse } from "@/lib/services/provider";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ responseId: string }> };

/**
 * `POST /api/provider-responses/{responseId}/cancel` — cancel the caller's own
 * response before cutoff (MP-A-130; UC-RESPONSE-008). Self-scoped and idempotent
 * on an already-cancelled response; rejects a passed cutoff or a locked
 * menu/response. The cancelled response is excluded from the batch but stays
 * auditable. Returns the updated `MemberResponseDto`.
 */
export const POST = withErrorBoundary(
  async (_request: Request, context: RouteContext) => {
    const { responseId } = await context.params;
    return Response.json(await cancelMyResponse(responseId), { status: 200 });
  },
);
