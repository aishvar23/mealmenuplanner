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
