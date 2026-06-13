import { withErrorBoundary } from "@/lib/errors";
import { getMenuDay } from "@/lib/services/provider";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ menuDayId: string }> };

/**
 * `GET /api/provider-menu-days/{menuDayId}` — one menu day with its full
 * component tree (MP-A-120, contract 03 § 8). RLS gates visibility (owner: any
 * status; approved customer: published/locked); an unreadable or unknown id is an
 * existence-hiding 404. Read-only — authoring/publish is MP-A-121 (blocked).
 */
export const GET = withErrorBoundary(
  async (_request: Request, context: RouteContext) => {
    const { menuDayId } = await context.params;
    return Response.json(await getMenuDay(menuDayId), { status: 200 });
  },
);
