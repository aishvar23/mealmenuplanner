import { withErrorBoundary } from "@/lib/errors";
import { readJsonObject } from "@/lib/http";
import { completeMemberOnboarding } from "@/lib/services/provider";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ providerId: string }> };

/**
 * `POST /api/providers/{providerId}/complete-member-onboarding` — persist the
 * approved customer's minimal onboarding (UC-MEMBER-ONBOARD-001). Body:
 * `{ displayName, phone?, defaultSpiceLevel?, allergyAck, termsAck, autoAcceptConsent? }`.
 * Returns the refreshed `MyProviderMembershipDto`.
 */
export const POST = withErrorBoundary(
  async (request: Request, context: RouteContext) => {
    const { providerId } = await context.params;
    const body = await readJsonObject(request);
    return Response.json(await completeMemberOnboarding(providerId, body), {
      status: 200,
    });
  },
);
