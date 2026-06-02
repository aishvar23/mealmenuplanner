import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/db/database.types";
import { InternalError } from "@/lib/errors";
import { toDishNutrition } from "@/lib/meal-plan/nutrition";
import {
  selectPackagePairings,
  type PairingCandidate,
} from "@/lib/recommendation";

import type { PairedDishDto } from "./dto";

/**
 * `mealPlan` service — meal "package" resolution (design/08 criterion 10,
 * BUG-008/009/010). For a set of planned/recommended primary dishes, resolve the
 * accompaniments that make each read as a wholesome plate — a starch base for a
 * `main_component`, plus a condiment — from the seeded `dish_pairings`.
 *
 * The pure {@link selectPackagePairings} decides *which* pairings to show; this
 * server-only layer reads the rows it needs (the primary's role drives the
 * choice; the paired dishes' names/roles come from a second batched read,
 * restricted to active dishes — RLS already hides inactive content). Used by
 * both the plan-display reads and the generate/suggest flows so the package is
 * consistent however a card was produced.
 */

type ServerClient = SupabaseClient<Database>;

/**
 * Resolve the display package for each given primary dish id. Returns a map
 * `dishId → chosen accompaniments`; a dish that stands alone (or is unknown)
 * maps to `[]`. Two batched reads regardless of input size.
 */
export async function resolvePackagesByDishId(
  supabase: ServerClient,
  dishIds: readonly string[],
): Promise<Map<string, PairedDishDto[]>> {
  const result = new Map<string, PairedDishDto[]>();
  const primaryIds = [...new Set(dishIds)];
  if (primaryIds.length === 0) return result;

  // 1) Every pairing whose primary is one of our dishes.
  const { data: pairings, error: pairErr } = await supabase
    .from("dish_pairings")
    .select("primary_dish_id, paired_dish_id, pairing_type")
    .in("primary_dish_id", primaryIds);
  if (pairErr) {
    throw new InternalError("Failed to load dish pairings.", {
      cause: pairErr,
    });
  }
  const pairRows = pairings ?? [];

  // 2) Names + roles for the primaries (role drives the choice) and the paired
  //    dishes (names for display), in one read, active only.
  const allIds = [
    ...new Set([...primaryIds, ...pairRows.map((r) => r.paired_dish_id)]),
  ];
  const { data: dishes, error: dishErr } = await supabase
    .from("dishes")
    .select(
      "id, name, meal_role, serving_qty, serving_unit, calories_kcal, protein_g, carbs_g, fat_g, glycemic_index",
    )
    .eq("status", "active")
    .in("id", allIds);
  if (dishErr) {
    throw new InternalError("Failed to load package dishes.", {
      cause: dishErr,
    });
  }
  const byId = new Map((dishes ?? []).map((d) => [d.id, d]));

  // Group the resolvable candidates per primary (skip a paired dish that is no
  // longer active), in a deterministic order so the selection is stable.
  const candidatesByPrimary = new Map<string, PairingCandidate[]>();
  for (const row of pairRows) {
    const paired = byId.get(row.paired_dish_id);
    if (!paired) continue;
    const list = candidatesByPrimary.get(row.primary_dish_id) ?? [];
    list.push({
      dishId: paired.id,
      dishName: paired.name,
      pairingType: row.pairing_type,
    });
    candidatesByPrimary.set(row.primary_dish_id, list);
  }

  for (const primaryId of primaryIds) {
    const primary = byId.get(primaryId);
    if (!primary) {
      result.set(primaryId, []);
      continue;
    }
    const candidates = (candidatesByPrimary.get(primaryId) ?? [])
      .slice()
      .sort(
        (a, b) =>
          a.pairingType.localeCompare(b.pairingType) ||
          a.dishName.localeCompare(b.dishName),
      );
    result.set(
      primaryId,
      selectPackagePairings(primary.meal_role, candidates).map((c) => {
        const paired = byId.get(c.dishId);
        return {
          dishId: c.dishId,
          dishName: c.dishName,
          pairingType: c.pairingType,
          nutrition: paired ? toDishNutrition(paired) : null,
        };
      }),
    );
  }

  return result;
}

/**
 * Populate `pairedDishes` in place on each row that carries a dish (an
 * eating-out / empty slot keeps its empty package). One batched resolution for
 * the whole array; a no-op when nothing has a dish.
 */
export async function attachPackages<
  T extends { dishId: string | null; pairedDishes: PairedDishDto[] },
>(supabase: ServerClient, rows: readonly T[]): Promise<void> {
  const dishIds = rows
    .map((r) => r.dishId)
    .filter((id): id is string => id !== null);
  if (dishIds.length === 0) return;

  const packages = await resolvePackagesByDishId(supabase, dishIds);
  for (const row of rows) {
    if (row.dishId) row.pairedDishes = packages.get(row.dishId) ?? [];
  }
}
