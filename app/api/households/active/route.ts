import { ValidationError, withErrorBoundary } from "@/lib/errors";
import { readJsonObject } from "@/lib/http";
import {
  listUserHouseholds,
  setActiveHousehold,
} from "@/lib/services/household";

// Resolves the session from cookies and writes; never statically cached.
export const dynamic = "force-dynamic";

/**
 * `PUT /api/households/active` — switch the caller's currently-viewed household
 * (BETA). Body `{ householdId }`. The service rejects a household the caller is
 * not an active member of (403). Returns the refreshed household list so the
 * switcher can update without a full reload.
 */
export const PUT = withErrorBoundary(async (request: Request) => {
  const body = await readJsonObject(request);
  if (typeof body.householdId !== "string") {
    throw new ValidationError("A householdId is required.", [
      { field: "householdId", rule: "required" },
    ]);
  }
  await setActiveHousehold(body.householdId);
  return Response.json(
    { households: await listUserHouseholds() },
    {
      status: 200,
    },
  );
});
