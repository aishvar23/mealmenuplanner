import { renderAggregateCsv } from "@/packages/shared/provider";

import { csvExportRoute } from "../csv-http";

export const dynamic = "force-dynamic";

/**
 * `GET /api/provider-preparation-batches/{batchId}/aggregate.csv` (MP-A-160; § 11,
 * UC-BATCH-003) — the owner downloads the aggregated preparation roster for the
 * current batch revision as a UTF-8 CSV. Owner-only (the read RPC self-gates); a
 * non-owner gets 403, a missing batch 404, a superseded revision 409. Built from the
 * persisted batch lines.
 */
export const GET = csvExportRoute(
  (batch) => renderAggregateCsv(batch.aggregateLines),
  (batch) => `preparation-aggregate-${batch.menuDate}-rev${batch.revision}.csv`,
);
