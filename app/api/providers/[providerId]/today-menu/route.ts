import { withErrorBoundary } from "@/lib/errors";
import { getTodayMenu } from "@/lib/services/provider";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ providerId: string }> };

/**
 * `GET /api/providers/{providerId}/today-menu` — the menu day for today in the
 * provider's timezone, or `null` when none is readable (MP-A-120, contract 03
 * § 8; UC-VIEW-001). RLS scopes visibility by role, so an awaiting customer sees
 * `null` rather than an unpublished menu.
 */
export const GET = withErrorBoundary(
  async (_request: Request, context: RouteContext) => {
    const { providerId } = await context.params;
    return Response.json(await getTodayMenu(providerId), { status: 200 });
  },
);
