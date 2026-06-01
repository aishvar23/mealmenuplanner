import "server-only";

import { requireAuthUser } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/db/server";
import { ForbiddenError, InternalError, NotFoundError } from "@/lib/errors";
import { isUuid } from "@/lib/validation";

/**
 * Delete a household the caller owns (BETA — households management). The power
 * resides with the owner alone: the `delete_household` SECURITY DEFINER RPC
 * (migration 20260601140000) re-verifies the caller is THIS household's active
 * owner before deleting, and the delete cascades to every household-scoped child
 * via the schema's FKs. A non-owner gets a 403; a non-member / bad id a 404.
 */
export async function deleteHousehold(householdId: string): Promise<void> {
  await requireAuthUser();
  if (!isUuid(householdId)) throw new NotFoundError("Household not found.");

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.rpc("delete_household", { h: householdId });
  if (error) {
    if (error.code === "42501") {
      throw new ForbiddenError("Only the household owner can delete it.", {
        cause: error,
      });
    }
    throw new InternalError("Failed to delete the household.", {
      cause: error,
    });
  }
}
