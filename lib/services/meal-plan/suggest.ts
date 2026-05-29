import "server-only";

import {
  recommendSlot,
  RECOMMENDATION_CONFIG,
  type CandidateDish,
  type ImageStatus,
  type Recommendation,
} from "@/lib/recommendation";
import { loadSlotInputs } from "@/lib/services/recommendation";

import type { AlternativeDto } from "./dto";
import type { MealSlot } from "./validate";

/**
 * Read-only slot suggestion (design/08 § 2/§ 5) — loads the recommendation
 * inputs and runs the pure engine for one `(date, slot)`, optionally excluding
 * dishes (the rejected/current dish for suggest-another and replace). Persists
 * nothing; the generate + item services decide what to write.
 *
 * `excludeDishIds` is applied as a hard candidate filter (the design/08
 * `excludeDishIds` semantics), separate from the engine's history-based rotation
 * penalty. Returns the ranked recommendations and a dishId → name map (the engine
 * returns ids only; names come from the loaded candidate set).
 */
export async function suggestForSlot(
  householdId: string,
  date: string,
  mealSlot: MealSlot,
  options: { excludeDishIds?: readonly string[]; now?: Date } = {},
): Promise<{
  recommendations: Recommendation[];
  nameById: Map<string, string>;
  imageById: Map<string, DishImageMeta>;
}> {
  const inputs = await loadSlotInputs(householdId, date, mealSlot);
  const excluded = new Set(options.excludeDishIds ?? []);
  const candidates = inputs.dishes.filter((d) => !excluded.has(d.id));

  const recommendations = recommendSlot({
    ...inputs,
    dishes: candidates,
    now: options.now ?? new Date(),
  });
  const nameById = new Map(inputs.dishes.map((d) => [d.id, d.name]));
  const imageById = new Map(inputs.dishes.map((d) => [d.id, toImageMeta(d)]));

  return { recommendations, nameById, imageById };
}

/**
 * The full set of dishes a household can pick for a slot (BUG-022/023) — every
 * candidate that survives the recommender's hard filters (diet / slot / role /
 * prep feasibility / do-not-suggest), ranked best-first, **uncapped** (unlike
 * {@link suggestForSlot}, which returns only the tuned top N). Powers the
 * single-select replacement picker, so the offered list stays consistent with
 * what the engine would itself suggest (SLOTPICK-005). The current dish is passed
 * via `excludeDishIds` so the picker never offers a no-op replacement.
 */
export async function listSlotCandidates(
  householdId: string,
  date: string,
  mealSlot: MealSlot,
  options: { excludeDishIds?: readonly string[]; now?: Date } = {},
): Promise<AlternativeDto[]> {
  const inputs = await loadSlotInputs(householdId, date, mealSlot);
  const excluded = new Set(options.excludeDishIds ?? []);
  const candidates = inputs.dishes.filter((d) => !excluded.has(d.id));

  const recommendations = recommendSlot({
    ...inputs,
    dishes: candidates,
    now: options.now ?? new Date(),
    // The picker is a deliberate user choice, so offer dishes whose advance prep
    // can't be finished in time too (BUG-031) — surfaced with a prep note rather
    // than hidden. Auto-suggestions still exclude them.
    allowInfeasiblePrep: true,
    // Lift the tuned top-N cap so the picker lists *all* eligible dishes.
    config: {
      ...RECOMMENDATION_CONFIG,
      topN: Math.max(candidates.length, 1),
    },
  });

  const nameById = new Map(inputs.dishes.map((d) => [d.id, d.name]));
  const imageById = new Map(inputs.dishes.map((d) => [d.id, toImageMeta(d)]));
  return toAlternatives(recommendations, nameById, imageById);
}

/**
 * Map the runner-up recommendations to the alternatives DTO (design/08 § 2).
 * `pairedDishes` defaults to `[]`; the caller runs `attachPackages` so each quick
 * swap also reads as a complete package (BUG-009).
 */
export function toAlternatives(
  recommendations: Recommendation[],
  nameById: Map<string, string>,
  imageById: Map<string, DishImageMeta> = new Map(),
): AlternativeDto[] {
  return recommendations.map((rec) => ({
    dishId: rec.dishId,
    dishName: nameById.get(rec.dishId) ?? null,
    dishImageUrl: imageById.get(rec.dishId)?.imageUrl ?? null,
    dishImageAltText: imageById.get(rec.dishId)?.imageAltText ?? null,
    dishImageStatus: imageById.get(rec.dishId)?.imageStatus ?? null,
    score: rec.score,
    reason: rec.reason,
    pairedDishes: [],
    // Advance-prep tasks (e.g. soaking) so the picker can flag dishes that need
    // prep ahead of time (BUG-031).
    prepTasks: rec.prepTasks.map((task) => ({
      taskName: task.taskName,
      requiredBeforeMinutes: task.requiredBeforeMinutes,
    })),
  }));
}

export interface DishImageMeta {
  imageUrl: string | null;
  imageAltText: string | null;
  imageStatus: ImageStatus;
}

function toImageMeta(dish: CandidateDish): DishImageMeta {
  return {
    imageUrl: dish.imageUrl,
    imageAltText: dish.imageAltText,
    imageStatus: dish.imageStatus,
  };
}
