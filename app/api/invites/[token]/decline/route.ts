import { withErrorBoundary } from "@/lib/errors";
import { declineInvite } from "@/lib/services/invite";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ token: string }> };

/**
 * `POST /api/invites/{token}/decline` — decline an invite (design/04 § 4.3,
 * design/07 § 4). Requires an authenticated session (the invitee). Sets the
 * invite `declined`; no membership is created. Returns `{ status: "declined" }`.
 */
export const POST = withErrorBoundary(
  async (_request: Request, context: RouteContext) => {
    const { token } = await context.params;
    const result = await declineInvite(token);
    return Response.json(result, { status: 200 });
  },
);
