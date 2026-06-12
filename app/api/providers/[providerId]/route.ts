import { withErrorBoundary } from "@/lib/errors";
import { readJsonObject } from "@/lib/http";
import { getProvider, updateProvider } from "@/lib/services/provider";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ providerId: string }> };

/**
 * `GET /api/providers/{providerId}` — the full provider org (MP-A-101, contract
 * 03 §8). Drives the owner settings form and the onboarding-wizard resume; gated
 * by RLS `porg_select` (awaiting/active members), so a non-member gets a 404.
 */
export const GET = withErrorBoundary(
  async (_request: Request, context: RouteContext) => {
    const { providerId } = await context.params;
    return Response.json(await getProvider(providerId), { status: 200 });
  },
);

/**
 * `PATCH /api/providers/{providerId}` — partial provider settings update
 * (MP-A-101, contract 03 §8). Owner-only via RLS `porg_update`; the server-set
 * `status`/`owner_user_id` are frozen by the guard trigger. Returns the updated
 * `ProviderDto`.
 */
export const PATCH = withErrorBoundary(
  async (request: Request, context: RouteContext) => {
    const { providerId } = await context.params;
    const body = await readJsonObject(request);
    return Response.json(await updateProvider(providerId, body), {
      status: 200,
    });
  },
);
