import { withErrorBoundary } from "@/lib/errors";
import { getProviderDashboard } from "@/lib/services/provider";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ providerId: string }> };

/**
 * `GET /api/providers/{providerId}/dashboard` — the owner's day-at-a-glance summary
 * (MP-B-060, spec §13.2): today's menu state + cutoff, and today's preparation batch
 * census + email status. Owner-only — a non-owner is existence-hidden (404).
 */
export const GET = withErrorBoundary(
  async (_request: Request, context: RouteContext) => {
    const { providerId } = await context.params;
    return Response.json(await getProviderDashboard(providerId), {
      status: 200,
    });
  },
);
