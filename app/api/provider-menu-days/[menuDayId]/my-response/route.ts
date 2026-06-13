import { withErrorBoundary } from "@/lib/errors";
import { getMyResponse } from "@/lib/services/provider";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ menuDayId: string }> };

/**
 * `GET /api/provider-menu-days/{menuDayId}/my-response` — the caller's own
 * response to the menu day (the read half of MP-A-130, contract 03 § 8). RLS
 * self-scopes to the caller; a not-yet-answered or unreadable day yields the
 * contract's empty "no response yet" shape (`responseId: null`), never leaking
 * existence. Read-only — save/confirm/cancel are the rest of MP-A-130.
 */
export const GET = withErrorBoundary(
  async (_request: Request, context: RouteContext) => {
    const { menuDayId } = await context.params;
    return Response.json(await getMyResponse(menuDayId), { status: 200 });
  },
);
