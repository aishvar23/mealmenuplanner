import { renderIndividualCsv } from "@/packages/shared/provider";

import { csvExportRoute } from "../csv-http";

export const dynamic = "force-dynamic";

/**
 * `GET /api/provider-preparation-batches/{batchId}/individual.csv` (MP-A-160; § 11,
 * UC-BATCH-004) — the owner downloads the per-member preparation breakdown for the
 * current batch revision as a UTF-8 CSV (one row per member line, included and extra
 * portions split by `is_extra`). Owner-only; reconciles with the aggregate.
 */
export const GET = csvExportRoute(
  (batch) => renderIndividualCsv(batch.individualLines),
  (batch) =>
    `preparation-individual-${batch.menuDate}-rev${batch.revision}.csv`,
);
