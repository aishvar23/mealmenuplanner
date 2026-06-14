import { withErrorBoundary } from "@/lib/errors";
import { regenerateBatch } from "@/lib/services/provider";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ batchId: string }> };

/**
 * `POST /api/provider-preparation-batches/{batchId}/regenerate` — the owner rebuilds the
 * preparation roster as a new immutable revision N+1 (MP-A-150; UC-OVERRIDE-002). The
 * prior revision is kept and marked stale; the summary email is NOT auto-resent. Owner-
 * only (enforced in the RPC). Returns the new `ProviderBatchRevisionDto`.
 */
export const POST = withErrorBoundary(
  async (_request: Request, context: RouteContext) => {
    const { batchId } = await context.params;
    return Response.json(await regenerateBatch(batchId), { status: 200 });
  },
);
