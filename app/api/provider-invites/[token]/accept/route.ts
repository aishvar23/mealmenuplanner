import { withErrorBoundary } from "@/lib/errors";
import { acceptProviderInvite } from "@/lib/services/provider";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ token: string }> };

/**
 * `POST /api/provider-invites/{token}/accept` — accept the invite as the
 * signed-in user, creating an `awaiting_approval` membership (MP-A-102, ADR-5).
 */
export const POST = withErrorBoundary(
  async (_request: Request, context: RouteContext) => {
    const { token } = await context.params;
    return Response.json(await acceptProviderInvite(token), { status: 200 });
  },
);
