import { withErrorBoundary } from "@/lib/errors";
import { getMyProviderMembership } from "@/lib/services/provider";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ providerId: string }> };

/**
 * `GET /api/providers/{providerId}/my-membership` — the caller's own membership
 * state (MP-B-021/MP-C-021 backend). Drives the member-onboarding gate and
 * prefills the onboarding form.
 */
export const GET = withErrorBoundary(
  async (_request: Request, context: RouteContext) => {
    const { providerId } = await context.params;
    return Response.json(await getMyProviderMembership(providerId), {
      status: 200,
    });
  },
);
