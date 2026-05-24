import { withErrorBoundary } from "@/lib/errors";
import { readJsonObject } from "@/lib/http";
import { createInvite } from "@/lib/services/invite";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ householdId: string }> };

/**
 * `POST /api/households/{householdId}/invites` — create an invite (design/04
 * § 4.3, design/07 § 6). Gated by `can_invite_members`. Body:
 * `{ email?, phone?, membershipType?, role?, startsAt?, expiresAt?, permissions? }`.
 * Returns `201 { inviteId, inviteLink }` — the link carries the plaintext token,
 * shown once. The base URL prefers `NEXT_PUBLIC_APP_URL` and falls back to the
 * request origin so the link is absolute and shareable.
 */
export const POST = withErrorBoundary(
  async (request: Request, context: RouteContext) => {
    const { householdId } = await context.params;
    const body = await readJsonObject(request);
    const appBaseUrl =
      process.env.NEXT_PUBLIC_APP_URL ?? new URL(request.url).origin;
    const result = await createInvite(householdId, body, appBaseUrl);
    return Response.json(result, { status: 201 });
  },
);
