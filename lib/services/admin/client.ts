import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/db/database.types";
import { InternalError, NotFoundError } from "@/lib/errors";

/**
 * Admin-service query helpers on the service-role client.
 *
 * The detail loaders resolve foreign-key display names (an ingredient's name, a
 * paired dish's name) with a second `id → name` lookup rather than an embedded
 * PostgREST join — this keeps the queries type-stable (no reliance on generated
 * relationship metadata or FK-constraint hint names) and trivially mockable.
 */

type AdminClient = SupabaseClient<Database>;

/** Tables this helper can resolve names from — both expose `id` + `name`. */
type NamedTable = "ingredients" | "dishes";

/**
 * Fetch `id → name` for the given ids from `table`, returning a `Map`. An empty
 * id list short-circuits to an empty map (no query). Duplicate ids are de-duped.
 */
export async function resolveNameMap(
  supabase: AdminClient,
  table: NamedTable,
  ids: string[],
): Promise<Map<string, string>> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return new Map();

  const { data, error } = await supabase
    .from(table)
    .select("id, name")
    .in("id", unique);

  if (error) {
    throw new InternalError(`Failed to resolve ${table} names.`, {
      cause: error,
    });
  }

  return new Map((data ?? []).map((row) => [row.id, row.name]));
}

/**
 * Assert a dish exists, throwing `NotFoundError` otherwise. Sub-resource adds
 * (ingredient/prep-task/pairing) call this first so a missing parent dish is a
 * clean 404 and a later FK violation can be attributed to the *referenced*
 * resource (a bad ingredient/paired-dish id) rather than the dish itself.
 */
export async function assertDishExists(
  supabase: AdminClient,
  dishId: string,
): Promise<void> {
  const { data, error } = await supabase
    .from("dishes")
    .select("id")
    .eq("id", dishId)
    .maybeSingle();
  if (error) {
    throw new InternalError("Failed to load dish.", { cause: error });
  }
  if (!data) throw new NotFoundError("Dish not found.");
}
