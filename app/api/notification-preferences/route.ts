import { withErrorBoundary } from "@/lib/errors";
import { readJsonObject } from "@/lib/http";
import {
  getMyEmailPreferences,
  updateMyEmailPreferences,
} from "@/lib/services/notification-preferences";

// Resolves the session from cookies; never statically cached.
export const dynamic = "force-dynamic";

/**
 * `GET /api/notification-preferences?householdId=…` — the signed-in user's email
 * opt-ins for that household (P9). Returns `{ householdId, categories }` with
 * every settable category present (absent rows read as `false`). Self-guards via
 * the service (`requireAuthUser` + active-membership 404); not under the `(app)`
 * prefix, so the proxy doesn't gate it.
 */
export const GET = withErrorBoundary(async (request: Request) => {
  const url = new URL(request.url);
  const householdId = url.searchParams.get("householdId") ?? "";
  const prefs = await getMyEmailPreferences(householdId);
  return Response.json(prefs, { status: 200 });
});

/**
 * `PUT /api/notification-preferences` — save the caller's email opt-ins. Body:
 * `{ householdId, categories: { <category>: boolean, … } }`. Returns the saved
 * preferences. Validation + tenancy checks live in the service.
 */
export const PUT = withErrorBoundary(async (request: Request) => {
  const body = await readJsonObject(request);
  const householdId =
    typeof body.householdId === "string" ? body.householdId : "";
  const prefs = await updateMyEmailPreferences(householdId, body);
  return Response.json(prefs, { status: 200 });
});
