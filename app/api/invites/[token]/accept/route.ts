import { withErrorBoundary } from "@/lib/errors";
import { acceptInvite } from "@/lib/services/invite";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ token: string }> };

/**
 * `POST /api/invites/{token}/accept` — redeem an invite (design/04 § 4.3,
 * design/07 § 6). Requires an authenticated session (the acceptor). Transactionally
 * sets the invite `accepted` and creates the caller's `active` membership; returns
 * `{ householdId, membershipStatus }`. CONFLICT if already redeemed/expired or the
 * caller already has a live membership.
 */
export const POST = withErrorBoundary(
  async (_request: Request, context: RouteContext) => {
    const { token } = await context.params;
    const result = await acceptInvite(token);
    return Response.json(result, { status: 200 });
  },
);
