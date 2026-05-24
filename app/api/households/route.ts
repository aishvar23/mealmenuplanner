import { ValidationError, withErrorBoundary } from "@/lib/errors";
import { readJsonObject } from "@/lib/http";
import { createHousehold } from "@/lib/services/household";

// Resolves the session from cookies and writes; never statically cached.
export const dynamic = "force-dynamic";

/**
 * `POST /api/households` — create a household (design/04 § 4.1).
 *
 * Any authenticated user may create one; they become its `owner` with every
 * `can_*` flag set. This is the "create another household" path — most users
 * arrive at a household through onboarding completion (P2-6) instead.
 *
 * Thin boundary: validate the body shape, delegate to the `household` service
 * (which re-validates the name and runs under the per-request RLS client), and
 * serialize. `withErrorBoundary` maps any throw to the standard error envelope.
 */
export const POST = withErrorBoundary(async (request: Request) => {
  const body = await readJsonObject(request);

  if (typeof body.name !== "string") {
    throw new ValidationError("Household name is required.", [
      { field: "name", rule: "required" },
    ]);
  }

  const result = await createHousehold({ name: body.name });
  return Response.json(result, { status: 201 });
});
