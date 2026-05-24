import { withErrorBoundary } from "@/lib/errors";
import { listNotifications } from "@/lib/services/notification";

// Resolves the session from cookies; never statically cached.
export const dynamic = "force-dynamic";

/**
 * `GET /api/notifications` — the signed-in user's inbox (design/09 § 7).
 *
 * Query params: `unreadOnly` (boolean, default false), `cursor`, `limit`
 * (default 20, max 50). Returns `{ items, unreadCount, nextCursor }`. Self-guards
 * via `requireAuthUser` inside the service (401 envelope, not a redirect) — this
 * is not an `(app)` shell prefix so the proxy doesn't gate it.
 */
export const GET = withErrorBoundary(async (request: Request) => {
  const url = new URL(request.url);
  const limitParam = url.searchParams.get("limit");
  const inbox = await listNotifications({
    unreadOnly: url.searchParams.get("unreadOnly") === "true",
    cursor: url.searchParams.get("cursor"),
    limit: limitParam === null ? undefined : Number(limitParam),
  });
  return Response.json(inbox, { status: 200 });
});
