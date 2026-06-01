import { ValidationError, withErrorBoundary } from "@/lib/errors";
import { readJsonObject } from "@/lib/http";
import {
  listUserHouseholds,
  setPreferredHousehold,
} from "@/lib/services/household";

// Resolves the session from cookies and writes; never statically cached.
export const dynamic = "force-dynamic";

/**
 * `PUT /api/households/preferred` — set the caller's preferred (default-on-login)
 * household (BETA). Body `{ householdId }`. The service rejects a household the
 * caller is not an active member of (403). Returns the refreshed household list.
 */
export const PUT = withErrorBoundary(async (request: Request) => {
  const body = await readJsonObject(request);
  if (typeof body.householdId !== "string") {
    throw new ValidationError("A householdId is required.", [
      { field: "householdId", rule: "required" },
    ]);
  }
  await setPreferredHousehold(body.householdId);
  return Response.json(
    { households: await listUserHouseholds() },
    {
      status: 200,
    },
  );
});
