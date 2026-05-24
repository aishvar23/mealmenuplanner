import { withErrorBoundary } from "@/lib/errors";
import { removePairing } from "@/lib/services/admin";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ dishId: string; pairingId: string }>;
};

/**
 * `DELETE /api/admin/dishes/{dishId}/pairings/{pairingId}` — remove a pairing
 * (P3-7). Pairings are immutable links, so there is no PATCH.
 */
export const DELETE = withErrorBoundary(
  async (_request: Request, context: RouteContext) => {
    const { dishId, pairingId } = await context.params;
    const result = await removePairing(dishId, pairingId);
    return Response.json(result, { status: 200 });
  },
);
