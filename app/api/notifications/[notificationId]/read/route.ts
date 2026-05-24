import { withErrorBoundary } from "@/lib/errors";
import { markNotificationRead } from "@/lib/services/notification";

export const dynamic = "force-dynamic";

// Next 16 passes dynamic route params as a Promise.
type RouteContext = { params: Promise<{ notificationId: string }> };

/**
 * `POST /api/notifications/{id}/read` — mark one notification read (design/09
 * § 7). Idempotent: a second call returns the same `readAt`. A notification that
 * isn't the caller's reads back as `NOT_FOUND` (existence-hiding via RLS).
 */
export const POST = withErrorBoundary(
  async (_request: Request, context: RouteContext) => {
    const { notificationId } = await context.params;
    const result = await markNotificationRead(notificationId);
    return Response.json(result, { status: 200 });
  },
);
