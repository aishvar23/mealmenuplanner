import { withErrorBoundary } from "@/lib/errors";
import { boundedCollection, readJsonObject } from "@/lib/http";
import { addPairing, listPairings } from "@/lib/services/admin";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ dishId: string }> };

/** `GET /api/admin/dishes/{dishId}/pairings` — the dish's pairings (P3-7). */
export const GET = withErrorBoundary(
  async (_request: Request, context: RouteContext) => {
    const { dishId } = await context.params;
    const pairings = await listPairings(dishId);
    return Response.json(boundedCollection(pairings), { status: 200 });
  },
);

/** `POST /api/admin/dishes/{dishId}/pairings` — add a pairing (P3-7). */
export const POST = withErrorBoundary(
  async (request: Request, context: RouteContext) => {
    const { dishId } = await context.params;
    const body = await readJsonObject(request);
    const pairing = await addPairing(dishId, body);
    return Response.json(pairing, { status: 201 });
  },
);
