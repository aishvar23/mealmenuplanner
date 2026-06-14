import { withErrorBoundary } from "@/lib/errors";
import { sendProviderSummaryEmail } from "@/lib/services/provider";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ batchId: string }> };

/**
 * `POST /api/provider-preparation-batches/{batchId}/resend-email` (MP-A-161;
 * UC-OVERRIDE-003, UC-NOTIFY-004) — the owner sends (or resends) the preparation-
 * summary email built from this persisted batch revision to the provider's
 * configured recipients. Owner-only (the underlying read RPC self-gates: non-owner
 * 403, missing 404, superseded 409). Best-effort (ADR-12): returns 200 with an
 * honest `ProviderSummaryEmailResultDto` rather than failing on a transport error.
 * The base URL prefers `NEXT_PUBLIC_APP_URL` and falls back to the request origin so
 * the email's links are absolute.
 */
export const POST = withErrorBoundary(
  async (request: Request, context: RouteContext) => {
    const { batchId } = await context.params;
    const appBaseUrl =
      process.env.NEXT_PUBLIC_APP_URL ?? new URL(request.url).origin;
    const result = await sendProviderSummaryEmail(batchId, appBaseUrl);
    return Response.json(result, { status: 200 });
  },
);
