import { withErrorBoundary } from "@/lib/errors";
import { markAllNotificationsRead } from "@/lib/services/notification";

export const dynamic = "force-dynamic";

/**
 * `POST /api/notifications/read-all` — clear the badge in one statement
 * (design/09 § 7). An optional `?householdId=` scopes it to one household (BETA);
 * omitted clears every household. Returns the number of notifications marked read.
 */
export const POST = withErrorBoundary(async (request: Request) => {
  const householdId = new URL(request.url).searchParams.get("householdId");
  const result = await markAllNotificationsRead(householdId ?? undefined);
  return Response.json(result, { status: 200 });
});
