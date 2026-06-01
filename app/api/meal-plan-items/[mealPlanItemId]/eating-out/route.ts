import { withErrorBoundary } from "@/lib/errors";
import {
  markEatingOut,
  validateEatingOutRequest,
} from "@/lib/services/meal-plan";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ mealPlanItemId: string }> };

/**
 * `POST /api/meal-plan-items/{mealPlanItemId}/eating-out` — mark the slot as
 * eating out (design/04 § 4.5, design/08 § 6, Flow 5). Clears the dish and sets
 * `eating_out`, which is deliberately excluded from rotation and grocery
 * aggregation. Gated by `can_change_today_menu`; 409 if locked.
 *
 * Accepts an optional JSON body `{ note }` (BETA) — a place the household has in
 * mind, shown on the tile. The body may be absent (a bare "eating out"); a
 * re-POST with a new `note` on an already eating-out slot just edits the note.
 */
export const POST = withErrorBoundary(
  async (request: Request, context: RouteContext) => {
    const { mealPlanItemId } = await context.params;
    const { note } = validateEatingOutRequest(await readOptionalBody(request));
    const item = await markEatingOut(mealPlanItemId, note);
    return Response.json(item, { status: 200 });
  },
);

/** Parse a JSON object body, tolerating an absent/empty body (returns `{}`). */
async function readOptionalBody(
  request: Request,
): Promise<Record<string, unknown>> {
  const text = await request.text();
  if (text.trim().length === 0) return {};
  try {
    const parsed: unknown = JSON.parse(text);
    return typeof parsed === "object" &&
      parsed !== null &&
      !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}
