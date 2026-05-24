import { withErrorBoundary } from "@/lib/errors";
import { removeMember } from "@/lib/services/household";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ householdId: string; memberId: string }>;
};

/**
 * `POST /api/households/{householdId}/members/{memberId}/remove` — remove a member
 * (design/04 § 4.4, design/07 § 10). Gated by `can_remove_members`. Soft state
 * (`active → removed`). CONFLICT for removing the owner or self. Returns
 * `{ memberId, status: "removed" }`.
 */
export const POST = withErrorBoundary(
  async (_request: Request, context: RouteContext) => {
    const { householdId, memberId } = await context.params;
    const result = await removeMember(householdId, memberId);
    return Response.json(result, { status: 200 });
  },
);
