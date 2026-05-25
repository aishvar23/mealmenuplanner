import "server-only";

import { requireAuthUser } from "@/lib/auth";
import type { Database } from "@/lib/db/database.types";
import { createServerSupabaseClient } from "@/lib/db/server";
import { InternalError } from "@/lib/errors";

type DietType = Database["public"]["Enums"]["diet_type"];

/**
 * Diet → the dish `diet_type`s safe to *offer* a household on that diet, mirroring
 * the engine's diet hierarchy (lib/recommendation/diet.ts) without scanning
 * ingredients. Used to keep the preferred-dish picker from suggesting, say, a
 * chicken curry to a vegetarian (BUG-006). A missing/unknown diet shows everything.
 */
const DIET_COMPATIBILITY: Record<DietType, DietType[]> = {
  vegan: ["vegan"],
  vegetarian: ["vegetarian", "vegan", "jain"],
  jain: ["jain"],
  eggetarian: ["eggetarian", "vegetarian", "vegan", "jain"],
  pescatarian: ["pescatarian", "vegetarian", "vegan", "eggetarian", "jain"],
  non_vegetarian: [
    "non_vegetarian",
    "pescatarian",
    "eggetarian",
    "vegetarian",
    "vegan",
    "jain",
  ],
};

/** A dish as the onboarding preferred-dish picker lists it. */
export interface DishCatalogItem {
  id: string;
  name: string;
  cuisine: string | null;
  dietType: DietType;
}

/**
 * `onboarding` service — list the dish catalog for the preferred-dish step
 * (BUG-006, PREFDISH-001..003).
 *
 * Returns active, **standalone-eligible** dishes (only `complete_meal` /
 * `main_component` roles — never a side/condiment/component, matching the engine's
 * standalone filter) so a household only "likes" things that can actually be
 * recommended. When `diet` is a known diet type the list is narrowed to the
 * compatible `diet_type`s; otherwise the full active catalog is returned. Requires
 * an authenticated caller; the read runs under the per-request RLS client.
 */
export async function listDishCatalog(
  diet?: string | null,
): Promise<DishCatalogItem[]> {
  await requireAuthUser();

  const supabase = await createServerSupabaseClient();
  let query = supabase
    .from("dishes")
    .select("id, name, cuisine, diet_type")
    .eq("status", "active")
    .in("meal_role", ["complete_meal", "main_component"])
    .order("name", { ascending: true });

  const allowed =
    diet && diet in DIET_COMPATIBILITY
      ? DIET_COMPATIBILITY[diet as DietType]
      : null;
  if (allowed) {
    query = query.in("diet_type", allowed);
  }

  const { data, error } = await query;
  if (error) {
    throw new InternalError("Failed to load the dish catalog.", {
      cause: error,
    });
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    cuisine: row.cuisine,
    dietType: row.diet_type,
  }));
}
