import { withErrorBoundary } from "@/lib/errors";
import { markAllNotificationsRead } from "@/lib/services/notification";

export const dynamic = "force-dynamic";

/**
 * `POST /api/notifications/read-all` — clear the badge in one statement
 * (design/09 § 7). Returns the number of notifications marked read.
 */
export const POST = withErrorBoundary(async () => {
  const result = await markAllNotificationsRead();
  return Response.json(result, { status: 200 });
});
