import { withErrorBoundary } from "@/lib/errors";
import { completeProviderOnboarding } from "@/lib/services/provider";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ providerId: string }> };

/**
 * `POST /api/providers/{providerId}/complete-onboarding` — promote the caller's
 * draft provider to `active` (MP-A-101, contract 03 §8). Owner-scoped and
 * idempotent; rejects a draft missing the required name + timezone. Returns the
 * activated `ProviderDto`.
 */
export const POST = withErrorBoundary(
  async (_request: Request, context: RouteContext) => {
    const { providerId } = await context.params;
    return Response.json(await completeProviderOnboarding(providerId), {
      status: 200,
    });
  },
);
