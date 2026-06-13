import { withErrorBoundary } from "@/lib/errors";
import { listProviderMembers } from "@/lib/services/provider";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ providerId: string }> };

/**
 * `GET /api/providers/{providerId}/members` — the provider's member roster
 * (MP-A-102, contract 03 § 8; owner only). Returns the `{ data, page }`
 * collection envelope of `MemberDto`. A non-owner caller gets a 404 (no leak).
 */
export const GET = withErrorBoundary(
  async (_request: Request, context: RouteContext) => {
    const { providerId } = await context.params;
    return Response.json(await listProviderMembers(providerId), {
      status: 200,
    });
  },
);
