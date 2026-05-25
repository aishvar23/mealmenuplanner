import "server-only";

import {
  recommendSlot,
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
