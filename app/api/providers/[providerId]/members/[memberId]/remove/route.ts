import { withErrorBoundary } from "@/lib/errors";
import { removeProviderMember } from "@/lib/services/provider";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ providerId: string; memberId: string }>;
};

/**
 * `POST /api/providers/{providerId}/members/{memberId}/remove` — remove an active
 * or awaiting customer (MP-A-102; owner only). Returns the updated `MemberDto`
 * (now `removed`).
 */
export const POST = withErrorBoundary(
  async (_request: Request, context: RouteContext) => {
    const { providerId, memberId } = await context.params;
    return Response.json(await removeProviderMember(providerId, memberId), {
      status: 200,
    });
  },
);
