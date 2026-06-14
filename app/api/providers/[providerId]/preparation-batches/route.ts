import { withErrorBoundary } from "@/lib/errors";
import { listProviderBatches } from "@/lib/services/provider";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ providerId: string }> };

/**
 * `GET /api/providers/{providerId}/preparation-batches` — the owner's index of
 * generated batches (MP-B-050, contract 03 § 8; owner only). Returns a bare array of
 * `ProviderBatchSummaryDto`, one per menu day's current revision, newest day first. A
 * non-owner gets an empty list (batches are owner-private; existence-hidden, no leak).
 */
export const GET = withErrorBoundary(
  async (_request: Request, context: RouteContext) => {
    const { providerId } = await context.params;
    return Response.json(await listProviderBatches(providerId), {
      status: 200,
    });
  },
);
