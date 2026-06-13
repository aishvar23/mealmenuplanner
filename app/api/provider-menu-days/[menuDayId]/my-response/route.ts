import { withErrorBoundary } from "@/lib/errors";
import { readJsonObject } from "@/lib/http";
import { getMyResponse, saveMyResponse } from "@/lib/services/provider";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ menuDayId: string }> };

/**
 * `GET /api/provider-menu-days/{menuDayId}/my-response` — the caller's own
 * response to the menu day (the read half of MP-A-130, contract 03 § 8). RLS
 * self-scopes to the caller; a not-yet-answered or unreadable day yields the
 * contract's empty "no response yet" shape (`responseId: null`), never leaking
 * existence.
 */
export const GET = withErrorBoundary(
  async (_request: Request, context: RouteContext) => {
    const { menuDayId } = await context.params;
    return Response.json(await getMyResponse(menuDayId), { status: 200 });
  },
);

/**
 * `PUT /api/provider-menu-days/{menuDayId}/my-response` — save the caller's
 * selections (the write half of MP-A-130; UC-RESPONSE-001..007). Body:
 * `SaveProviderResponseRequest`. The server DERIVES quantities and enforces the
 * menu/cutoff/version rules; returns the full `MemberResponseDto`. A stale
 * `expectedVersion` is a `409 CONFLICT { reason: "stale_version", currentVersion }`.
 */
export const PUT = withErrorBoundary(
  async (request: Request, context: RouteContext) => {
    const { menuDayId } = await context.params;
    const body = await readJsonObject(request);
    return Response.json(await saveMyResponse(menuDayId, body), {
      status: 200,
    });
  },
);
