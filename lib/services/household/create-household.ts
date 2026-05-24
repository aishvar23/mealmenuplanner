import "server-only";

import { requireAuthUser } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/db/server";
import { InternalError, ValidationError } from "@/lib/errors";

/**
 * `household` service — household creation (P1-5).
 *
 * Creating a household is the owner-bootstrap path: it writes the `households`
 * row and the creator's `owner` `household_members` row (every `can_*` flag
 * `true`) atomically. Both the atomicity and the RLS bootstrap (the creator is
 * not a member yet, so the `hm_insert` policy can't pass under their JWT) are
 * handled by the `create_household` SECURITY DEFINER function (migration P1-5);
 * this service validates input and invokes it via RPC under the per-request,
 * RLS-scoped client. See design/04 § 4.1 and design/06 § 7.
 *
 * This is the standalone "create another household" path (`POST /api/households`,
 * P1-6). Onboarding completion (P2-6) is the richer draft→live transaction.
 */

/** Upper bound on a household name; mirrored by the `create_household` backstop. */
export const MAX_HOUSEHOLD_NAME_LENGTH = 100;

export interface CreateHouseholdInput {
  name: string;
}

export interface CreateHouseholdResult {
  householdId: string;
}

/**
 * Trim and validate a household name. Throws `ValidationError` (400) for an
 * empty or oversized name (design/04 § 4.1). Pure — no I/O — so it is unit-
 * testable and reusable by the onboarding path.
 */
export function normalizeHouseholdName(rawName: string): string {
  const name = rawName.trim();
  if (name.length === 0) {
    throw new ValidationError("Household name is required.", [
      { field: "name", rule: "required" },
    ]);
  }
  if (name.length > MAX_HOUSEHOLD_NAME_LENGTH) {
    throw new ValidationError("Household name is too long.", [
      {
        field: "name",
        rule: "maxLength",
        max: MAX_HOUSEHOLD_NAME_LENGTH,
      },
    ]);
  }
  return name;
}

/**
 * Create a household with the authenticated caller as its owner. Returns the new
 * household id. Throws `UnauthenticatedError` (no session), `ValidationError`
 * (bad name), or `InternalError` (RPC failure).
 */
export async function createHousehold(
  input: CreateHouseholdInput,
): Promise<CreateHouseholdResult> {
  await requireAuthUser();
  const name = normalizeHouseholdName(input.name);

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("create_household", {
    p_name: name,
  });

  if (error) {
    throw new InternalError("Failed to create household.", { cause: error });
  }
  if (!data) {
    throw new InternalError("Household creation returned no id.");
  }

  return { householdId: data };
}
