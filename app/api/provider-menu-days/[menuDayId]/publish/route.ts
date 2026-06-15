import { withErrorBoundary } from "@/lib/errors";
import { publishMenuDay } from "@/lib/services/provider";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ menuDayId: string }> };

/**
 * `POST /api/provider-menu-days/{menuDayId}/publish` — publish a draft menu day
 * (MP-A-121, contract 03 § 5/§ 8; UC-MENU-003). Owner-only. The server gates
 * structural completeness (reusing the shared `validateMenuCompleteness`) and
 * DB-context completeness (catalog item active + owned, no cross-provider ref),
 * flips the day + its weekly container to `published`, and fans out
 * `provider_menu_published` to active customers. Returns the published
 * `MenuDayDto`. Failures: `400` menu incomplete (with issues), `403`
 * owner-required, `404` existence-hiding, `409` menu-not-draft.
 */
export const POST = withErrorBoundary(
  async (_request: Request, context: RouteContext) => {
    const { menuDayId } = await context.params;
    return Response.json(await publishMenuDay(menuDayId), { status: 200 });
  },
);
