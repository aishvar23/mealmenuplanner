import "server-only";

import { getActiveMembership } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/db/server";
import { NotFoundError, ValidationError } from "@/lib/errors";
import {
  recommendSlot,
  type Recommendation,
  type RecommendationConfig,
  type SlotRecommendationInput,
} from "@/lib/recommendation";
import { isUuid } from "@/lib/validation";

import {
  loadActiveMembers,
  loadCandidateDishes,
  loadHouseholdContext,
  loadMealHistory,
} from "./load-inputs";
import { validateSlotRequest, type MealSlot } from "./validate";

/**
 * `recommendation` service (P4) — loads a household's recommendation inputs and
 * runs the pure engine for one slot (design/05 § 2). Read-only: it returns the
 * ranked output contract and persists nothing; the generate/Today endpoints that
 * write `meal_plan_items` are built on top of this in P5.
 *
 * Access mirrors the other household reads: a non-member (or expired guest) gets
 * `NotFoundError` (existence-hiding, design/04 § 2). Member food preferences are
 * still loaded for ALL active members via the SECURITY DEFINER projection RPC, so
 * allergy filtering is correct no matter who triggers the generate.
 */

export interface RecommendForSlotOptions {
  /** Injected clock for prep feasibility (defaults to now); enables deterministic tests. */
  now?: Date;
  /** Dishes already chosen earlier in a weekly run, treated as recently cooked (§10). */
  usedThisRun?: ReadonlySet<string>;
  /** Override the default tuned weights/thresholds (§11). */
  config?: RecommendationConfig;
}

/** The assembled, ready-to-score inputs for one slot (sans clock/run state). */
export type SlotInputs = Pick<
  SlotRecommendationInput,
  "household" | "members" | "dishes" | "history" | "date" | "mealSlot"
>;

/**
 * Load every input the engine needs for one slot (design/05 § 3), gated by active
 * membership. Throws `NotFoundError` for a non-member/unknown household and
 * `ValidationError` if the household has no preferences yet (onboarding not done).
 */
export async function loadSlotInputs(
  householdId: string,
  date: string,
  mealSlot: MealSlot,
): Promise<SlotInputs> {
  if (!isUuid(householdId)) throw new NotFoundError("Household not found.");

  const membership = await getActiveMembership(householdId);
  if (!membership) throw new NotFoundError("Household not found.");

  const supabase = await createServerSupabaseClient();

  const household = await loadHouseholdContext(supabase, householdId);
  if (!household) {
    throw new ValidationError(
      "Set up your household preferences before generating meal suggestions.",
      [{ field: "preferences", rule: "required" }],
    );
  }

  const [members, dishes, history] = await Promise.all([
    loadActiveMembers(supabase, householdId),
    loadCandidateDishes(supabase, mealSlot),
    loadMealHistory(supabase, householdId, date, household.varietyGapDays),
  ]);

  return { household, members, dishes, history, date, mealSlot };
}

/**
 * Recommend ranked dishes for one household slot (design/05 § 9). Validates the
 * request, loads inputs, and runs the deterministic engine.
 */
export async function recommendForSlot(
  householdId: string,
  date: string,
  mealSlot: string,
  options: RecommendForSlotOptions = {},
): Promise<Recommendation[]> {
  const request = validateSlotRequest(date, mealSlot);
  const inputs = await loadSlotInputs(
    householdId,
    request.date,
    request.mealSlot,
  );

  return recommendSlot({
    ...inputs,
    now: options.now ?? new Date(),
    usedThisRun: options.usedThisRun,
    config: options.config,
  });
}
