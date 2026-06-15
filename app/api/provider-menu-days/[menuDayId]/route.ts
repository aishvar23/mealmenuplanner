import { withErrorBoundary } from "@/lib/errors";
import { readJsonObject } from "@/lib/http";
import {
  getMenuDay,
  reviseMenuDay,
  updateMenuDayNote,
} from "@/lib/services/provider";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ menuDayId: string }> };

/**
 * `GET /api/provider-menu-days/{menuDayId}` — one menu day with its full
 * component tree (MP-A-120, contract 03 § 8). RLS gates visibility (owner: any
 * status; approved customer: published/locked); an unreadable or unknown id is an
 * existence-hiding 404. Read-only.
 */
export const GET = withErrorBoundary(
  async (_request: Request, context: RouteContext) => {
    const { menuDayId } = await context.params;
    return Response.json(await getMenuDay(menuDayId), { status: 200 });
  },
);

/**
 * `PUT /api/provider-menu-days/{menuDayId}` — a STRUCTURAL edit (MP-A-012E + MP-A-121,
 * ADR-7 = REVISION; UC-MENU-004/005; owner only, before cutoff). Body: `EditMenuDayInput`
 * — the full desired component tree + cutoff (+ note); the date is immutable. When no
 * member has responded the change applies in place; once a response exists the server
 * creates a new revision (rev N+1), carries responses forward, selectively invalidates
 * the affected ones (member notified to re-confirm), and archives the prior revision.
 * Returns the resulting live `200 MenuDayDto`. Failures: `400` invalid body /
 * menu-incomplete / cutoff-invalid, `403`→`404` non-owner (existence-hidden), `409`
 * menu-not-editable.
 */
export const PUT = withErrorBoundary(
  async (request: Request, context: RouteContext) => {
    const { menuDayId } = await context.params;
    const body = await readJsonObject(request);
    return Response.json(await reviseMenuDay(menuDayId, body), { status: 200 });
  },
);

/**
 * `PATCH /api/provider-menu-days/{menuDayId}` — a NON-STRUCTURAL edit (ADR-7): the
 * day's note, applied in place regardless of responses (never a revision). Body:
 * `UpdateMenuDayNoteInput`. Owner only. Returns `200 MenuDayDto`.
 */
export const PATCH = withErrorBoundary(
  async (request: Request, context: RouteContext) => {
    const { menuDayId } = await context.params;
    const body = await readJsonObject(request);
    return Response.json(await updateMenuDayNote(menuDayId, body), {
      status: 200,
    });
  },
);
