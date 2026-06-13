import { withErrorBoundary } from "@/lib/errors";
import { getWeeklyMenu } from "@/lib/services/provider";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ providerId: string }> };

/**
 * `GET /api/providers/{providerId}/weekly-menu` — the readable menu days in the
 * 7-day window [today, today+6] in the provider's timezone, ascending by date
 * (MP-A-120, contract 03 § 8; UC-VIEW-002). RLS filters each day by the caller's
 * role, so a customer's list omits drafts.
 */
export const GET = withErrorBoundary(
  async (_request: Request, context: RouteContext) => {
    const { providerId } = await context.params;
    return Response.json(await getWeeklyMenu(providerId), { status: 200 });
  },
);
