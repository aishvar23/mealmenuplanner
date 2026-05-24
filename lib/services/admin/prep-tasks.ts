import "server-only";

import { requireAdmin } from "@/lib/auth";
import { createServiceRoleClient } from "@/lib/db/service-role";
import { InternalError, NotFoundError } from "@/lib/errors";
import type { JsonObject } from "@/lib/http";
import { isUuid } from "@/lib/validation";

import { assertDishExists } from "./client";
import { toPrepTaskDto, type PrepTaskDto } from "./dto";
import { buildPrepTaskInsert, buildPrepTaskUpdate } from "./validate-prep-task";

/**
 * `admin` service — prep-task editor (docs/06, P3-6). Task name, required-before
 * minutes, description (e.g. "soak chickpeas 480 min ahead"). Gated by
 * `requireAdmin()`, run on the service-role client.
 */

/** List a dish's prep tasks, longest lead time first. */
export async function listPrepTasks(dishId: string): Promise<PrepTaskDto[]> {
  if (!isUuid(dishId)) throw new NotFoundError("Dish not found.");
  await requireAdmin();
  const supabase = createServiceRoleClient();

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

/** Add a prep task to a dish; returns the created task DTO. */
export async function addPrepTask(
  dishId: string,
  body: JsonObject,
): Promise<PrepTaskDto> {
  if (!isUuid(dishId)) throw new NotFoundError("Dish not found.");
  await requireAdmin();
  const fields = buildPrepTaskInsert(body);

  const supabase = createServiceRoleClient();
  await assertDishExists(supabase, dishId);

  const { data, error } = await supabase
    .from("dish_prep_tasks")
    .insert({ ...fields, dish_id: dishId })
    .select("*")
    .single();

  if (error) {
    throw new InternalError("Failed to add prep task.", { cause: error });
  }
  return toPrepTaskDto(data);
}

/** Update a prep task (scoped to its dish); returns the updated DTO. */
export async function updatePrepTask(
  dishId: string,
  taskId: string,
  body: JsonObject,
): Promise<PrepTaskDto> {
  if (!isUuid(dishId) || !isUuid(taskId)) {
    throw new NotFoundError("Prep task not found.");
  }
  await requireAdmin();
  const update = buildPrepTaskUpdate(body);

  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("dish_prep_tasks")
    .update(update)
    .eq("id", taskId)
    .eq("dish_id", dishId)
    .select("*")
    .maybeSingle();

  if (error) {
    throw new InternalError("Failed to update prep task.", { cause: error });
  }
  if (!data) throw new NotFoundError("Prep task not found.");
  return toPrepTaskDto(data);
}

/** Remove a prep task from a dish. */
export async function removePrepTask(
  dishId: string,
  taskId: string,
): Promise<{ id: string; removed: true }> {
  if (!isUuid(dishId) || !isUuid(taskId)) {
    throw new NotFoundError("Prep task not found.");
  }
  await requireAdmin();

  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("dish_prep_tasks")
    .delete()
    .eq("id", taskId)
    .eq("dish_id", dishId)
    .select("id")
    .maybeSingle();

  if (error) {
    throw new InternalError("Failed to remove prep task.", { cause: error });
  }
  if (!data) throw new NotFoundError("Prep task not found.");
  return { id: data.id, removed: true };
}
