import { withErrorBoundary } from "@/lib/errors";
import { getProviderBatchForMenuDay } from "@/lib/services/provider";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ menuDayId: string }> };

/**
 * `GET /api/provider-menu-days/{menuDayId}/preparation-batch` — the current batch's
 * full roster for a menu day (MP-B-050, contract 03 § 8; owner only). Resolves the
 * day's current batch under RLS and returns the `BatchDto` roster + header. A non-owner
 * or a day with no current batch is existence-hidden as 404; a superseded revision is
 * 409 `batch_stale` (the by-id read's postures, reused).
 */
export const GET = withErrorBoundary(
  async (_request: Request, context: RouteContext) => {
    const { menuDayId } = await context.params;
    return Response.json(await getProviderBatchForMenuDay(menuDayId), {
      status: 200,
    });
  },
);
