import { withErrorBoundary } from "@/lib/errors";
import { previewProviderInvite } from "@/lib/services/provider";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ token: string }> };

/**
 * `GET /api/provider-invites/{token}` — the safe, anon-readable invite preview
 * (MP-A-102, contract 03 § 8). Returns only the provider name, inviter name,
 * role, and expiry; an unknown/expired/non-pending token resolves to 404.
 */
export const GET = withErrorBoundary(
  async (_request: Request, context: RouteContext) => {
    const { token } = await context.params;
    return Response.json(await previewProviderInvite(token), { status: 200 });
  },
);
