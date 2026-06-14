import { withErrorBoundary } from "@/lib/errors";
import {
  getProviderBatch,
  type ProviderBatchReadDto,
} from "@/lib/services/provider";

/**
 * Shared response builder for the owner preparation CSV exports (MP-A-160). The
 * rendered CSV already carries the UTF-8 BOM (see `@mmp/shared/provider`'s
 * `renderAggregateCsv`/`renderIndividualCsv`); this only attaches the download
 * headers. `no-store` because a batch revision's roster is owner-private and
 * cheap to re-fetch.
 */
export function csvDownloadResponse(csv: string, filename: string): Response {
  return new Response(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}

type RouteContext = { params: Promise<{ batchId: string }> };

/**
 * Factory for the two owner CSV export routes (MP-A-160). They differ only in which
 * renderer + filename they use; the owner-gated fetch (`getProviderBatch` — the read
 * RPC self-gates: non-owner 403, missing 404, superseded 409) and the download
 * response are identical, so both `aggregate.csv` and `individual.csv` route off this
 * one handler rather than two near-identical copies (review PR #47, finding #7).
 *
 * @param render   the batch → CSV body renderer (`renderAggregateCsv` / `renderIndividualCsv`)
 * @param filename the batch → download filename
 */
export function csvExportRoute(
  render: (batch: ProviderBatchReadDto) => string,
  filename: (batch: ProviderBatchReadDto) => string,
): (request: Request, context: RouteContext) => Promise<Response> {
  return withErrorBoundary(async (_request: Request, context: RouteContext) => {
    const { batchId } = await context.params;
    const batch = await getProviderBatch(batchId);
    return csvDownloadResponse(render(batch), filename(batch));
  });
}
