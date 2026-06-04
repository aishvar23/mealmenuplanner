import "server-only";

import { requireAuthUser } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/db/server";
import { InternalError } from "@/lib/errors";

import { allowedDietsFor } from "./diet-compatibility";
import type { DishCatalogItem } from "./list-dish-catalog";

/**
 * `onboarding` service — list accompaniment dishes for the "Goes with" picker in
 * `build` mode (P10).
 *
 * Unlike {@link listDishCatalog} (mains only), accompaniments span every role —
 * breads (roti/naan), sides, condiments (chutney), and other mains a household
 * pairs alongside — so this is the *full* active, diet-compatible catalog, ordered
 * by popularity then name. An optional `search` narrows by dish name
 * (case-insensitive substring) for the typeable picker. Requires an authenticated
 * caller; the read runs under the per-request RLS client.
 */
export async function listAccompanimentCatalog(
  diet?: string | null,
  search?: string | null,
): Promise<DishCatalogItem[]> {
  await requireAuthUser();

  const supabase = await createServerSupabaseClient();
  let query = supabase
    .from("dishes")
    .select(
      "id, name, cuisine, diet_type, image_url, image_alt_text, image_status, weight_loss, high_protein",
    )
    .eq("status", "active")
    .order("popularity_count", { ascending: false })
    .order("name", { ascending: true });

  const allowed = allowedDietsFor(diet);
  if (allowed) {
    query = query.in("diet_type", allowed);
  }

  const term = search?.trim();
  if (term) {
    // ilike with escaped wildcards — a substring match on the dish name.
    const escaped = term.replace(/[%_]/g, (ch) => `\\${ch}`);
    query = query.ilike("name", `%${escaped}%`);
  }

  const { data, error } = await query;
  if (error) {
    throw new InternalError("Failed to load the accompaniments.", {
      cause: error,
    });
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    cuisine: row.cuisine,
    dietType: row.diet_type,
    imageUrl: row.image_url,
    imageAltText: row.image_alt_text,
    imageStatus: row.image_status,
    weightLoss: row.weight_loss,
    highProtein: row.high_protein,
  }));
}
