import { withErrorBoundary } from "@/lib/errors";
import { readJsonObject } from "@/lib/http";
import {
  setGroceryItemChecked,
  validateCheckedRequest,
} from "@/lib/services/grocery";

// Resolves the session from cookies and writes a grocery item; never cached.
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ groceryListItemId: string }> };

/**
 * `PATCH /api/grocery-list-items/{groceryListItemId}` — check an item off / on
 * (design/08 § 9 "Checking items off"). Body: `{ checked }`. Resolves the
 * household from the item's parent list and gates on `can_manage_grocery_list`;
 * a row hidden by RLS reads as a 404 (existence-hiding). Returns the updated item.
 */
export const PATCH = withErrorBoundary(
  async (request: Request, context: RouteContext) => {
    const { groceryListItemId } = await context.params;
    const body = await readJsonObject(request);
    const { checked } = validateCheckedRequest(body);
    const item = await setGroceryItemChecked(groceryListItemId, checked);
    return Response.json(item);
  },
);
