import { withErrorBoundary } from "@/lib/errors";
import { getInvitePreview } from "@/lib/services/invite";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ token: string }> };

/**
 * `GET /api/invites/{token}` — unauthenticated invite preview (design/04 § 4.3,
 * design/03 § 7). The only public endpoint: served via the `get_invite_preview`
 * SECURITY DEFINER RPC, it returns only the non-sensitive preview fields for a
 * pending, unexpired invite, and a generic `NOT_FOUND` for anything else (no
 * existence oracle). No session is required.
 */
export const GET = withErrorBoundary(
  async (_request: Request, context: RouteContext) => {
    const { token } = await context.params;
    const preview = await getInvitePreview(token);
    return Response.json(preview, { status: 200 });
  },
);
