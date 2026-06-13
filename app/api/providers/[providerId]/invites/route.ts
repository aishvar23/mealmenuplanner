import { withErrorBoundary } from "@/lib/errors";
import { readJsonObject } from "@/lib/http";
import { createProviderInvite } from "@/lib/services/provider";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ providerId: string }> };

/**
 * `POST /api/providers/{providerId}/invites` — invite a customer (MP-A-102,
 * contract 03 § 8; owner only). Body: `{ email?, phone?, expiresAt? }`. Returns
 * `201 { inviteId, inviteLink, emailStatus }`; the link carries the one-time
 * plaintext token. The base URL prefers `NEXT_PUBLIC_APP_URL` and falls back to
 * the request origin so the link is absolute and shareable.
 */
export const POST = withErrorBoundary(
  async (request: Request, context: RouteContext) => {
    const { providerId } = await context.params;
    const body = await readJsonObject(request);
    const appBaseUrl =
      process.env.NEXT_PUBLIC_APP_URL ?? new URL(request.url).origin;
    const result = await createProviderInvite(providerId, body, appBaseUrl);
    return Response.json(result, { status: 201 });
  },
);
