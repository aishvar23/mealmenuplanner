import "server-only";

import { requireAdmin } from "@/lib/auth";
import { createServiceRoleClient } from "@/lib/db/service-role";
import { InternalError, NotFoundError } from "@/lib/errors";
import type { JsonObject } from "@/lib/http";
import { isUuid } from "@/lib/validation";

import { assertDishExists, resolveNameMap } from "./client";
import { mapContentWriteError } from "./dishes";
import { toDishIngredientDto, type DishIngredientDto } from "./dto";
import {
  buildDishIngredientInsert,
  buildDishIngredientUpdate,
} from "./validate-dish-ingredient";

/**
 * `admin` service — dish-ingredient editor (docs/06, P3-5). Quantity per
 * serving, unit, required/optional. Gated by `requireAdmin()`, run on the
 * service-role client. `unique(dish_id, ingredient_id)` → `ConflictError`; a bad
 * `ingredientId` (FK) → `ValidationError` (design/01).
 */

/** List a dish's ingredient links (with resolved ingredient names). */
export async function listDishIngredients(
  dishId: string,
): Promise<DishIngredientDto[]> {
  if (!isUuid(dishId)) throw new NotFoundError("Dish not found.");
  await requireAdmin();
  const supabase = createServiceRoleClient();

  const { data, error } = await supabase
    .from("dish_ingredients")
    .select("*")
    .eq("dish_id", dishId)
    .order("created_at", { ascending: true });
  if (error) {
    throw new InternalError("Failed to load dish ingredients.", {
      cause: error,
    });
  }
  const rows = data ?? [];
  const names = await resolveNameMap(
    supabase,
    "ingredients",
    rows.map((row) => row.ingredient_id),
  );
  return rows.map((row) =>
    toDishIngredientDto(row, names.get(row.ingredient_id) ?? null),
  );
}

/** Add an ingredient to a dish; returns the created link DTO. */
export async function addDishIngredient(
  dishId: string,
  body: JsonObject,
): Promise<DishIngredientDto> {
  if (!isUuid(dishId)) throw new NotFoundError("Dish not found.");
  await requireAdmin();
  const fields = buildDishIngredientInsert(body);

  const supabase = createServiceRoleClient();
  await assertDishExists(supabase, dishId);

  const { data, error } = await supabase
    .from("dish_ingredients")
    .insert({ ...fields, dish_id: dishId })
    .select("*")
    .single();

  if (error) {
    mapContentWriteError(error, {
      conflict: "This ingredient is already on the dish.",
      badReference: "ingredientId does not reference a known ingredient.",
    });
  }
  const names = await resolveNameMap(supabase, "ingredients", [
    data.ingredient_id,
  ]);
  return toDishIngredientDto(data, names.get(data.ingredient_id) ?? null);
}

/** Update a dish-ingredient link (scoped to its dish); returns the updated DTO. */
export async function updateDishIngredient(
  dishId: string,
  linkId: string,
  body: JsonObject,
): Promise<DishIngredientDto> {
  if (!isUuid(dishId) || !isUuid(linkId)) {
    throw new NotFoundError("Dish ingredient not found.");
  }
  await requireAdmin();
  const update = buildDishIngredientUpdate(body);

  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("dish_ingredients")
    .update(update)
    .eq("id", linkId)
    .eq("dish_id", dishId)
    .select("*")
    .maybeSingle();

  if (error) {
    mapContentWriteError(error, {
      conflict: "This ingredient is already on the dish.",
      badReference: "ingredientId does not reference a known ingredient.",
    });
  }
  if (!data) throw new NotFoundError("Dish ingredient not found.");
  const names = await resolveNameMap(supabase, "ingredients", [
    data.ingredient_id,
  ]);
  return toDishIngredientDto(data, names.get(data.ingredient_id) ?? null);
}

/** Remove an ingredient from a dish. */
export async function removeDishIngredient(
  dishId: string,
  linkId: string,
): Promise<{ id: string; removed: true }> {
  if (!isUuid(dishId) || !isUuid(linkId)) {
    throw new NotFoundError("Dish ingredient not found.");
  }
  await requireAdmin();

  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("dish_ingredients")
    .delete()
    .eq("id", linkId)
    .eq("dish_id", dishId)
    .select("id")
    .maybeSingle();

  if (error) {
    throw new InternalError("Failed to remove dish ingredient.", {
      cause: error,
    });
  }
  if (!data) throw new NotFoundError("Dish ingredient not found.");
  return { id: data.id, removed: true };
}
