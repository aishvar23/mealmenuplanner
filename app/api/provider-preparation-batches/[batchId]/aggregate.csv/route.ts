import { withErrorBoundary } from "@/lib/errors";
import { getProviderBatch } from "@/lib/services/provider";
import { renderAggregateCsv } from "@/packages/shared/provider";

import { csvDownloadResponse } from "../csv-http";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ batchId: string }> };

/**
 * `GET /api/provider-preparation-batches/{batchId}/aggregate.csv` (MP-A-160; § 11,
 * UC-BATCH-003) — the owner downloads the aggregated preparation roster for a
 * persisted batch revision as a UTF-8 CSV. Owner-only (the read RPC self-gates);
 * a non-owner gets 403, a missing batch 404. Built from the persisted batch lines.
 */
export const GET = withErrorBoundary(
  async (_request: Request, context: RouteContext) => {
    const { batchId } = await context.params;
    const batch = await getProviderBatch(batchId);
    return csvDownloadResponse(
      renderAggregateCsv(batch.aggregateLines),
      `preparation-aggregate-${batch.menuDate}-rev${batch.revision}.csv`,
    );
  },
);
