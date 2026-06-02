import { withErrorBoundary } from "@/lib/errors";
import { readJsonObject } from "@/lib/http";
import { createInvite, listPendingInvites } from "@/lib/services/invite";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ householdId: string }> };

/**
 * `GET /api/households/{householdId}/invites` — list the household's pending
 * invites (design/07 § 8). Additive read for the mobile client; the web renders
 * this in a Server Component, so it had no HTTP route. Gated by
 * `can_invite_members` (non-inviters get an empty list); a non-member is surfaced
 * as `NOT_FOUND`. Returns the `{ data, page }` collection envelope.
 */
export const GET = withErrorBoundary(
  async (_request: Request, context: RouteContext) => {
    const { householdId } = await context.params;
    return Response.json(await listPendingInvites(householdId));
  },
);

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
