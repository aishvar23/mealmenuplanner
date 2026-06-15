import { withErrorBoundary } from "@/lib/errors";
import { readJsonObject } from "@/lib/http";
import { createMenuDay } from "@/lib/services/provider";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ providerId: string }> };

/**
 * `POST /api/providers/{providerId}/menus` — author a new DRAFT menu day with its
 * full component tree (MP-A-121, contract 03 § 5/§ 8; UC-MENU-001/002; owner only).
 * Body: `CreateMenuDayInput` — catalog item ids + structure; the server denormalizes
 * every display field off the owner-private catalog and creates the day `draft`
 * (publishing is the separate `.../publish` POST). Returns `201 MenuDayDto`.
 * Failures: `400` invalid body / menu-incomplete (bad item refs / malformed
 * customization), `403`→`404` non-owner (existence-hidden), `409` menu-day-exists.
 */
export const POST = withErrorBoundary(
  async (request: Request, context: RouteContext) => {
    const { providerId } = await context.params;
    const body = await readJsonObject(request);
    const menuDay = await createMenuDay(providerId, body);
    return Response.json(menuDay, { status: 201 });
  },
);
