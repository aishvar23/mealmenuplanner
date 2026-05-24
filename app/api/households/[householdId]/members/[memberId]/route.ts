import { withErrorBoundary } from "@/lib/errors";
import { readJsonObject } from "@/lib/http";
import { updateMember } from "@/lib/services/household";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ householdId: string; memberId: string }>;
};

/**
 * `PATCH /api/households/{householdId}/members/{memberId}` — update a member's
 * role/permissions (design/04 § 4.4, design/07 § 2). Gated by `can_remove_members`.
 * Body: any subset of `role` + `can_*` flags. Setting `role: "owner"` triggers an
 * ownership transfer (design/07 § 11). Returns the updated member object.
 */
export const PATCH = withErrorBoundary(
  async (request: Request, context: RouteContext) => {
    const { householdId, memberId } = await context.params;
    const body = await readJsonObject(request);
    const member = await updateMember(householdId, memberId, body);
    return Response.json(member, { status: 200 });
  },
);
