import "server-only";

import { requireAdmin } from "@/lib/auth";
import { createServiceRoleClient } from "@/lib/db/service-role";
import { ConflictError, InternalError, NotFoundError } from "@/lib/errors";
import type { JsonObject } from "@/lib/http";
import { isUuid } from "@/lib/validation";

import { toIngredientDto, type IngredientDto } from "./dto";
import {
  buildIngredientInsert,
  buildIngredientUpdate,
} from "./validate-ingredient";

/**
 * `admin` service — ingredient catalog management (docs/06, P3-4). Gated by
 * `requireAdmin()`, run on the service-role client (see ./dishes for the
 * rationale). The unique `ingredients.name` and the `dish_ingredients →
 * ingredients` ON DELETE RESTRICT FK (design/01) surface as `ConflictError`.
 */

const INGREDIENT_LIST_LIMIT = 500;
const PG_UNIQUE_VIOLATION = "23505";
const PG_FK_VIOLATION = "23503";

/** Filters for the ingredient list. */
export interface IngredientListFilters {
  search?: string;
  category?: string;
}

/** List ingredients, alphabetically, with optional name/category filters. */
export async function listIngredients(
  filters: IngredientListFilters = {},
): Promise<IngredientDto[]> {
  await requireAdmin();
  const supabase = createServiceRoleClient();

  let query = supabase
    .from("ingredients")
    .select("*")
    .order("name", { ascending: true })
    .limit(INGREDIENT_LIST_LIMIT);

  if (filters.search) query = query.ilike("name", `%${filters.search}%`);
  if (filters.category) query = query.eq("category", filters.category);

  const { data, error } = await query;
  if (error) {
    throw new InternalError("Failed to load ingredients.", { cause: error });
  }
  return (data ?? []).map(toIngredientDto);
}

/** Create an ingredient; a duplicate name is a `ConflictError`. */
export async function createIngredient(
  body: JsonObject,
): Promise<IngredientDto> {
  await requireAdmin();
  const insert = buildIngredientInsert(body);

  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("ingredients")
    .insert(insert)
    .select("*")
    .single();

  if (error) {
    if (error.code === PG_UNIQUE_VIOLATION) {
      throw new ConflictError("An ingredient with that name already exists.", {
        reason: "duplicate_name",
      });
    }
    throw new InternalError("Failed to create ingredient.", { cause: error });
  }
  return toIngredientDto(data);
}

/** Apply a partial ingredient update; returns the updated DTO. */
export async function updateIngredient(
  ingredientId: string,
  body: JsonObject,
): Promise<IngredientDto> {
  if (!isUuid(ingredientId)) throw new NotFoundError("Ingredient not found.");
  await requireAdmin();
  const update = buildIngredientUpdate(body);

  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("ingredients")
    .update(update)
    .eq("id", ingredientId)
    .select("*")
    .maybeSingle();

  if (error) {
    if (error.code === PG_UNIQUE_VIOLATION) {
      throw new ConflictError("An ingredient with that name already exists.", {
        reason: "duplicate_name",
      });
    }
    throw new InternalError("Failed to update ingredient.", { cause: error });
  }
  if (!data) throw new NotFoundError("Ingredient not found.");
  return toIngredientDto(data);
}

/**
 * Delete an ingredient. An ingredient still used by a dish cannot be deleted
 * (`dish_ingredients.ingredient_id` ON DELETE RESTRICT, design/01) → `ConflictError`.
 */
export async function deleteIngredient(
  ingredientId: string,
): Promise<{ id: string; deleted: true }> {
  if (!isUuid(ingredientId)) throw new NotFoundError("Ingredient not found.");
  await requireAdmin();

  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("ingredients")
    .delete()
    .eq("id", ingredientId)
    .select("id")
    .maybeSingle();

  if (error) {
    if (error.code === PG_FK_VIOLATION) {
      throw new ConflictError(
        "This ingredient is used by one or more dishes and cannot be deleted.",
        { reason: "in_use" },
      );
    }
    throw new InternalError("Failed to delete ingredient.", { cause: error });
  }
  if (!data) throw new NotFoundError("Ingredient not found.");
  return { id: data.id, deleted: true };
}
