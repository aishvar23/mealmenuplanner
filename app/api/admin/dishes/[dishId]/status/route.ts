import { Constants } from "@/lib/db/database.types";
import { ValidationError, withErrorBoundary } from "@/lib/errors";
import { readJsonObject } from "@/lib/http";
import { setDishStatus } from "@/lib/services/admin";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ dishId: string }> };

const DISH_STATUSES = Constants.public.Enums.dish_status;

/**
 * `POST /api/admin/dishes/{dishId}/status` — activate / archive / un-publish a
 * dish (P3-8). Body: `{ "status": "active" | "archived" | "draft" }`. Moving to
 * `active` runs the quality checklist in `setDishStatus` and 400s (listing the
 * unmet items) when the dish is not ready. Returns the refreshed dish detail.
 */
export const POST = withErrorBoundary(
  async (request: Request, context: RouteContext) => {
    const { dishId } = await context.params;
    const body = await readJsonObject(request);

    const status = body.status;
    if (
      typeof status !== "string" ||
      !(DISH_STATUSES as readonly string[]).includes(status)
    ) {
      throw new ValidationError("A valid status is required.", [
        { field: "status", rule: "enum", allowed: DISH_STATUSES },
      ]);
    }

    const detail = await setDishStatus(
      dishId,
      status as (typeof DISH_STATUSES)[number],
    );
    return Response.json(detail, { status: 200 });
  },
);
