import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/db/database.types";

import type { ActionItemRow } from "./access";

/**
 * Daily-approval promotion hook (P10-5).
 *
 * When a household *accepts* a meal whose main dish they configured "goes with"
 * accompaniments for in the "Build your own combination" onboarding mode (Mode 2,
 * stored in `household_dish_accompaniments`), that approval is the household
 * telling us this plate works — so we promote it into the global catalog as a
 * `proposed` meal combination for admin review (P10-5). The actual write is the
 * `propose_meal_combination` SECURITY DEFINER RPC, which bypasses the admin-write
 * RLS on `meal_combinations` but re-checks the caller is an active member and that
 * every dish is active (P10-3).
 *
 * The RPC de-dupes by `(proposed_by_household_id, lower(name), source)`, so
 * accepting the same plate again is idempotent (it returns the existing
 * submission) and never floods the admin queue.
 */

type ServerClient = SupabaseClient<Database>;

/**
 * Best-effort variant: promotes the accepted meal's combo (if any) and swallows
 * any failure (logged server-side). Domain services call this AFTER the accept
 * has committed, so a promotion glitch never rolls back the user's action — the
 * same pattern as `safeEmitHouseholdEvent` / `safeRegenerateGroceryListForPlan`.
 */
export async function safeProposeCombination(
  supabase: ServerClient,
  item: ActionItemRow,
): Promise<void> {
  try {
    await proposeCombinationFromAcceptedMeal(supabase, item);
  } catch (error) {
    console.error("[meal-plan] failed to propose combination", {
      householdId: item.household_id,
      dishId: item.dish_id,
      error,
    });
  }
}

/**
 * Submit the accepted main dish + its household accompaniments as a `proposed`
 * combination. A no-op (returns early) when the dish has no configured
 * accompaniments — i.e. it isn't a self-built combo — or the household has no
 * preferences row yet. Throws on a DB/RPC error so {@link safeProposeCombination}
 * can log it.
 */
async function proposeCombinationFromAcceptedMeal(
  supabase: ServerClient,
  item: ActionItemRow,
): Promise<void> {
  if (!item.dish_id) return;

  // The accompaniments the household paired with this main dish (Mode 2). None →
  // this isn't a self-built combination, so there is nothing to promote.
  const { data: accompaniments, error: accError } = await supabase
    .from("household_dish_accompaniments")
    .select("accompaniment_dish_id")
    .eq("household_id", item.household_id)
    .eq("dish_id", item.dish_id);
  if (accError) throw accError;

  const accompanimentIds = (accompaniments ?? []).map(
    (row) => row.accompaniment_dish_id,
  );
  if (accompanimentIds.length === 0) return;

  // The combination's stored diet is the household's own diet — it built the
  // plate for itself, so the plate is coherent with that diet by construction.
  const { data: prefs, error: prefsError } = await supabase
    .from("household_preferences")
    .select("diet_type")
    .eq("household_id", item.household_id)
    .maybeSingle();
  if (prefsError) throw prefsError;
  // diet_type is nullable on household_preferences; without it the combination
  // has no coherent diet to store, so there is nothing to promote.
  if (!prefs?.diet_type) return;

  // Cuisine is informational only on a combination (never a filter); pull it off
  // the main dish so the admin queue shows a useful label.
  const { data: dish, error: dishError } = await supabase
    .from("dishes")
    .select("cuisine")
    .eq("id", item.dish_id)
    .maybeSingle();
  if (dishError) throw dishError;

  const mainName = item.dishes?.name ?? "Household";
  const dishIds = [item.dish_id, ...accompanimentIds];

  const { error: rpcError } = await supabase.rpc("propose_meal_combination", {
    p_household_id: item.household_id,
    p_name: `${mainName} plate`,
    p_diet_type: prefs.diet_type,
    p_dish_ids: dishIds,
    ...(dish?.cuisine ? { p_cuisine: dish.cuisine } : {}),
  });
  if (rpcError) throw rpcError;
}
