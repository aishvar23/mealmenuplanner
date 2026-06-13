import { withErrorBoundary } from "@/lib/errors";
import { confirmMyResponse } from "@/lib/services/provider";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ responseId: string }> };

/**
 * `POST /api/provider-responses/{responseId}/confirm` — confirm the caller's own
 * response (MP-A-130; UC-RESPONSE-001/007). Self-scoped and idempotent on an
 * already-confirmed response; rejects an empty response, a passed cutoff, or a
 * locked menu/response. Returns the updated `MemberResponseDto`.
 */
export const POST = withErrorBoundary(
  async (_request: Request, context: RouteContext) => {
    const { responseId } = await context.params;
    return Response.json(await confirmMyResponse(responseId), { status: 200 });
  },
);
