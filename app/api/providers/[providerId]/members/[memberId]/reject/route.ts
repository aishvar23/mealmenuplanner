import { withErrorBoundary } from "@/lib/errors";
import { rejectProviderMember } from "@/lib/services/provider";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ providerId: string; memberId: string }>;
};

/**
 * `POST /api/providers/{providerId}/members/{memberId}/reject` — reject an
 * awaiting-approval customer (MP-A-102; owner only). Returns the updated
 * `MemberDto` (now `rejected`).
 */
export const POST = withErrorBoundary(
  async (_request: Request, context: RouteContext) => {
    const { providerId, memberId } = await context.params;
    return Response.json(await rejectProviderMember(providerId, memberId), {
      status: 200,
    });
  },
);
