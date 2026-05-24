import "server-only";

import { requireAdmin } from "@/lib/auth";
import { createServiceRoleClient } from "@/lib/db/service-role";
import { InternalError, NotFoundError } from "@/lib/errors";
import type { JsonObject } from "@/lib/http";
import { isUuid } from "@/lib/validation";

import { assertDishExists, resolveNameMap } from "./client";
import { mapContentWriteError } from "./dishes";
import { toPairingDto, type PairingDto } from "./dto";
import { buildPairingInsert } from "./validate-pairing";

/**
 * `admin` service — pairing editor (docs/06, P3-7). Directional pairings
 * (primary → paired) of one type: main_side, rice_pairing, bread_pairing,
 * condiment, beverage. Gated by `requireAdmin()`, run on the service-role
 * client. Pairings are immutable links (create + delete only):
 * `unique(primary, paired, type)` → `ConflictError`; `no_self_pair` / a bad
 * `pairedDishId` → `ValidationError` (design/01).
 */

/** List a dish's pairings (with resolved paired-dish names). */
export async function listPairings(dishId: string): Promise<PairingDto[]> {
  if (!isUuid(dishId)) throw new NotFoundError("Dish not found.");
  await requireAdmin();
  const supabase = createServiceRoleClient();

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

/** Add a pairing to a dish; returns the created pairing DTO. */
export async function addPairing(
  dishId: string,
  body: JsonObject,
): Promise<PairingDto> {
  if (!isUuid(dishId)) throw new NotFoundError("Dish not found.");
  await requireAdmin();
  const fields = buildPairingInsert(body, dishId);

  const supabase = createServiceRoleClient();
  await assertDishExists(supabase, dishId);

  const { data, error } = await supabase
    .from("dish_pairings")
    .insert({ ...fields, primary_dish_id: dishId })
    .select("*")
    .single();

  if (error) {
    mapContentWriteError(error, {
      conflict: "This pairing already exists.",
      badReference: "pairedDishId does not reference a known dish.",
      check: "A dish cannot be paired with itself.",
    });
  }
  const names = await resolveNameMap(supabase, "dishes", [data.paired_dish_id]);
  return toPairingDto(data, names.get(data.paired_dish_id) ?? null);
}

/** Remove a pairing from a dish. */
export async function removePairing(
  dishId: string,
  pairingId: string,
): Promise<{ id: string; removed: true }> {
  if (!isUuid(dishId) || !isUuid(pairingId)) {
    throw new NotFoundError("Pairing not found.");
  }
  await requireAdmin();

  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("dish_pairings")
    .delete()
    .eq("id", pairingId)
    .eq("primary_dish_id", dishId)
    .select("id")
    .maybeSingle();

  if (error) {
    throw new InternalError("Failed to remove pairing.", { cause: error });
  }
  if (!data) throw new NotFoundError("Pairing not found.");
  return { id: data.id, removed: true };
}
