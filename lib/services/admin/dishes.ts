import "server-only";

import { requireAdmin } from "@/lib/auth";
import type { Database } from "@/lib/db/database.types";
import { createServiceRoleClient } from "@/lib/db/service-role";
import {
  ConflictError,
  InternalError,
  NotFoundError,
  ValidationError,
} from "@/lib/errors";
import type { JsonObject } from "@/lib/http";
import { isUuid } from "@/lib/validation";

import { resolveNameMap } from "./client";
import {
  toDishDto,
  toDishIngredientDto,
  toPairingDto,
  toPrepTaskDto,
  type DishDetailDto,
  type DishDto,
  type DishIngredientDto,
  type PairingDto,
  type PrepTaskDto,
} from "./dto";
import { evaluateQualityChecklist } from "./quality-checklist";
import {
  buildDishInsert,
  buildDishUpdate,
  type DishListFilters,
} from "./validate-dish";

/**
 * `admin` service — dish content management (docs/06, P3-2/3/8).
 *
 * Every function gates on `requireAdmin()` (the operator role, design/03 § 5),
 * then runs on the **service-role client** — admin tooling is the one
 * user-facing path the service-role client is sanctioned for (design/02
 * § Supabase client strategy), and it is the only way to read non-`active`
 * dishes (the RLS read policy exposes just `active` rows). The `app_role`
 * write-RLS on the content tables stays the in-band backstop.
 */

type DishStatus = Database["public"]["Enums"]["dish_status"];

/** Max dishes returned by the list (the console paginates client-side for MVP). */
const DISH_LIST_LIMIT = 200;

const PG_UNIQUE_VIOLATION = "23505";
const PG_FK_VIOLATION = "23503";
const PG_CHECK_VIOLATION = "23514";

/** List dishes with the operator-console filters, newest-updated first (P3-2). */
export async function listDishes(
  filters: DishListFilters = {},
): Promise<DishDto[]> {
  await requireAdmin();
  const supabase = createServiceRoleClient();

  let query = supabase
    .from("dishes")
    .select("*")
    .order("updated_at", { ascending: false })
    .limit(DISH_LIST_LIMIT);

  if (filters.search) query = query.ilike("name", `%${filters.search}%`);
  if (filters.cuisine) query = query.eq("cuisine", filters.cuisine);
  if (filters.mealSlot)
    query = query.contains("meal_slots", [filters.mealSlot]);
  if (filters.dietType) query = query.eq("diet_type", filters.dietType);
  if (filters.status) query = query.eq("status", filters.status);
  if (filters.missingMetadata) {
    // "Missing metadata" = missing a required activation field that is cheap to
    // query (cuisine / total time). Ingredient completeness is surfaced by the
    // per-dish quality checklist (P3-8), not this list filter.
    query = query.or(
      "cuisine.is.null,total_time_minutes.is.null,total_time_minutes.eq.0",
    );
  }

  const { data, error } = await query;
  if (error) {
    throw new InternalError("Failed to load dishes.", { cause: error });
  }
  return (data ?? []).map(toDishDto);
}

/** Load one dish with its ingredients, prep tasks, pairings, and checklist. */
export async function getDish(dishId: string): Promise<DishDetailDto> {
  if (!isUuid(dishId)) throw new NotFoundError("Dish not found.");
  await requireAdmin();
  const supabase = createServiceRoleClient();

  const { data: dish, error } = await supabase
    .from("dishes")
    .select("*")
    .eq("id", dishId)
    .maybeSingle();
  if (error) {
    throw new InternalError("Failed to load dish.", { cause: error });
  }
  if (!dish) throw new NotFoundError("Dish not found.");

  const [ingredients, prepTasks, pairings] = await Promise.all([
    loadDishIngredients(supabase, dishId),
    loadPrepTasks(supabase, dishId),
    loadPairings(supabase, dishId),
  ]);

  const qualityChecklist = evaluateQualityChecklist({
    name: dish.name,
    cuisine: dish.cuisine,
    mealSlots: dish.meal_slots,
    totalTimeMinutes: dish.total_time_minutes,
    ingredientCount: ingredients.length,
    prepTaskCount: prepTasks.length,
    hasAnyTag:
      dish.kid_friendly ||
      dish.lunchbox_friendly ||
      dish.leftover_friendly ||
      dish.batch_cook_friendly ||
      dish.diabetic_friendly ||
      dish.low_sodium ||
      dish.high_protein ||
      dish.low_carb ||
      dish.weight_loss,
  });

  return {
    ...toDishDto(dish),
    ingredients,
    prepTasks,
    pairings,
    qualityChecklist,
  };
}

/** Create a dish (always starts `draft`); returns the created dish DTO (P3-3). */
export async function createDish(body: JsonObject): Promise<DishDto> {
  await requireAdmin();
  const insert = buildDishInsert(body);

  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("dishes")
    .insert(insert)
    .select("*")
    .single();

  if (error) {
    throw new InternalError("Failed to create dish.", { cause: error });
  }
  return toDishDto(data);
}

/** Apply a partial dish update; returns the updated dish DTO (P3-3). */
export async function updateDish(
  dishId: string,
  body: JsonObject,
): Promise<DishDto> {
  if (!isUuid(dishId)) throw new NotFoundError("Dish not found.");
  await requireAdmin();
  const update = buildDishUpdate(body);

  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("dishes")
    .update(update)
    .eq("id", dishId)
    .select("*")
    .maybeSingle();

  if (error) {
    throw new InternalError("Failed to update dish.", { cause: error });
  }
  if (!data) throw new NotFoundError("Dish not found.");
  return toDishDto(data);
}

/**
 * Transition a dish's status (P3-8). Moving to `active` runs the quality
 * checklist and throws `ValidationError` (listing the unmet items) when the
 * dish is not ready; `archived`/`draft` transitions are always allowed.
 */
export async function setDishStatus(
  dishId: string,
  status: DishStatus,
): Promise<DishDetailDto> {
  if (!isUuid(dishId)) throw new NotFoundError("Dish not found.");
  await requireAdmin();

  // Load the full detail (incl. checklist) under the admin client. getDish
  // already gates, but a second requireAdmin is cheap and keeps this composable.
  const detail = await getDish(dishId);

  if (status === "active" && !detail.qualityChecklist.canActivate) {
    throw new ValidationError(
      "This dish does not meet the activation quality checklist.",
      detail.qualityChecklist.unmetRequired.map((label) => ({
        field: "qualityChecklist",
        rule: "incomplete",
        message: label,
      })),
    );
  }

  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("dishes")
    .update({ status })
    .eq("id", dishId)
    .select("*")
    .maybeSingle();

  if (error) {
    throw new InternalError("Failed to update dish status.", { cause: error });
  }
  if (!data) throw new NotFoundError("Dish not found.");

  // Return the refreshed detail so the client re-renders the new status + checklist.
  return { ...detail, ...toDishDto(data) };
}

// ─────────────────────────── internal loaders ───────────────────────────
// Shared by getDish; each takes the already-created admin client (no re-gating).

type AdminClient = ReturnType<typeof createServiceRoleClient>;

async function loadDishIngredients(
  supabase: AdminClient,
  dishId: string,
): Promise<DishIngredientDto[]> {
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

async function loadPrepTasks(
  supabase: AdminClient,
  dishId: string,
): Promise<PrepTaskDto[]> {
  const { data, error } = await supabase
    .from("dish_prep_tasks")
    .select("*")
    .eq("dish_id", dishId)
    .order("required_before_minutes", { ascending: false });
  if (error) {
    throw new InternalError("Failed to load prep tasks.", { cause: error });
  }
  return (data ?? []).map(toPrepTaskDto);
}

async function loadPairings(
  supabase: AdminClient,
  dishId: string,
): Promise<PairingDto[]> {
  const { data, error } = await supabase
    .from("dish_pairings")
    .select("*")
    .eq("primary_dish_id", dishId)
    .order("created_at", { ascending: true });
  if (error) {
    throw new InternalError("Failed to load pairings.", { cause: error });
  }
  const rows = data ?? [];
  const names = await resolveNameMap(
    supabase,
    "dishes",
    rows.map((row) => row.paired_dish_id),
  );
  return rows.map((row) =>
    toPairingDto(row, names.get(row.paired_dish_id) ?? null),
  );
}

/** Translate common Postgres write errors on the content tables to domain errors. */
export function mapContentWriteError(
  error: { code?: string } | null,
  context: { conflict?: string; badReference?: string; check?: string },
): never {
  if (error?.code === PG_UNIQUE_VIOLATION && context.conflict) {
    throw new ConflictError(context.conflict, { reason: "duplicate" });
  }
  if (error?.code === PG_FK_VIOLATION && context.badReference) {
    throw new ValidationError(context.badReference, [
      { field: "reference", rule: "foreignKey" },
    ]);
  }
  if (error?.code === PG_CHECK_VIOLATION && context.check) {
    throw new ValidationError(context.check, [
      { field: "body", rule: "check" },
    ]);
  }
  throw new InternalError("The content write failed.", { cause: error });
}
