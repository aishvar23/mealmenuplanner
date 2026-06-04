import "server-only";

import { requireAuthUser } from "@/lib/auth";
import type { Database } from "@/lib/db/database.types";
import { createServerSupabaseClient } from "@/lib/db/server";
import { InternalError } from "@/lib/errors";

import { allowedDietsFor } from "./diet-compatibility";

type DietType = Database["public"]["Enums"]["diet_type"];
type ImageStatus = Database["public"]["Enums"]["image_status"];

/** A member dish of a combination, as the picker card renders it. */
export interface CombinationDish {
  id: string;
  name: string;
  cuisine: string | null;
  /** Free-text display label (dal/dry_veg/bread/rice/main/condiment). */
  roleInCombo: string | null;
  imageUrl: string | null;
  imageAltText: string | null;
  imageStatus: ImageStatus;
  /** Dietician-curated goal flags powering the top-level meal filter. */
  weightLoss: boolean;
  highProtein: boolean;
}

/** An admin-curated meal combination as the "Select combinations" mode lists it. */
export interface CombinationCatalogItem {
  id: string;
  name: string;
  description: string | null;
  cuisine: string | null;
  dietType: DietType;
  popularityCount: number;
  /** The fixed dish set, in `sort_order`. */
  dishes: CombinationDish[];
}

interface CombinationRow {
  id: string;
  name: string;
  description: string | null;
  cuisine: string | null;
  diet_type: DietType;
  popularity_count: number;
  meal_combination_items: {
    sort_order: number;
    role_in_combo: string | null;
    dishes: {
      id: string;
      name: string;
      cuisine: string | null;
      image_url: string | null;
      image_alt_text: string | null;
      image_status: ImageStatus;
      weight_loss: boolean;
      high_protein: boolean;
    } | null;
  }[];
}

/**
 * `onboarding` service — list the meal-combination catalog for the "Select
 * combinations" mode (P10).
 *
 * Returns `active` admin-curated combinations with their fixed dish set (for the
 * card thumbnails), ordered by popularity (most-selected first) then name, so the
 * picker surfaces the household favourites first. When `diet` is a known diet type
 * the list is narrowed to the compatible `diet_type`s (a vegetarian household
 * never sees a non-veg combo); otherwise the full active catalog is returned.
 * Requires an authenticated caller; the read runs under the per-request RLS client
 * (which only exposes `active` combos).
 */
export async function listCombinationCatalog(
  diet?: string | null,
): Promise<CombinationCatalogItem[]> {
  await requireAuthUser();

  const supabase = await createServerSupabaseClient();
  let query = supabase
    .from("meal_combinations")
    .select(
      "id, name, description, cuisine, diet_type, popularity_count, " +
        "meal_combination_items(sort_order, role_in_combo, " +
        "dishes(id, name, cuisine, image_url, image_alt_text, image_status, weight_loss, high_protein))",
    )
    .eq("status", "active")
    .order("popularity_count", { ascending: false })
    .order("name", { ascending: true });

  const allowed = allowedDietsFor(diet);
  if (allowed) {
    query = query.in("diet_type", allowed);
  }

  const { data, error } = await query;
  if (error) {
    throw new InternalError("Failed to load the meal combinations.", {
      cause: error,
    });
  }

  return ((data ?? []) as unknown as CombinationRow[]).map((combo) => ({
    id: combo.id,
    name: combo.name,
    description: combo.description,
    cuisine: combo.cuisine,
    dietType: combo.diet_type,
    popularityCount: combo.popularity_count,
    dishes: combo.meal_combination_items
      .slice()
      .sort((a, b) => a.sort_order - b.sort_order)
      .flatMap((item) =>
        item.dishes
          ? [
              {
                id: item.dishes.id,
                name: item.dishes.name,
                cuisine: item.dishes.cuisine,
                roleInCombo: item.role_in_combo,
                imageUrl: item.dishes.image_url,
                imageAltText: item.dishes.image_alt_text,
                imageStatus: item.dishes.image_status,
                weightLoss: item.dishes.weight_loss,
                highProtein: item.dishes.high_protein,
              },
            ]
          : [],
      ),
  }));
}
