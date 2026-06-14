import { withErrorBoundary } from "@/lib/errors";
import { getProviderBatch } from "@/lib/services/provider";
import { renderIndividualCsv } from "@/packages/shared/provider";

import { csvDownloadResponse } from "../csv-http";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ batchId: string }> };

/**
 * `GET /api/provider-preparation-batches/{batchId}/individual.csv` (MP-A-160; § 11,
 * UC-BATCH-004) — the owner downloads the per-member preparation breakdown for a
 * persisted batch revision as a UTF-8 CSV (one row per member line, included and
 * extra portions split by `is_extra`). Owner-only; reconciles with the aggregate.
 */
export const GET = withErrorBoundary(
  async (_request: Request, context: RouteContext) => {
    const { batchId } = await context.params;
    const batch = await getProviderBatch(batchId);
    return csvDownloadResponse(
      renderIndividualCsv(batch.individualLines),
      `preparation-individual-${batch.menuDate}-rev${batch.revision}.csv`,
    );
  },
);
