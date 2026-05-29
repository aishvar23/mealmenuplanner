/**
 * The per-slot recommendation pipeline (design/05 § 2, § 9). `recommendSlot`
 * loads nothing — it operates on the already-loaded {@link SlotRecommendationInput}
 * — so it is pure and deterministic: walk every candidate through the hard
 * filters (§4), score the survivors (§5–§7), sort by a stable key, and return
 * the top-N as the output contract (§9), each with its explanation (§8).
 *
 * Determinism (design/05 § 1): inputs are read once, ties break on
 * `score desc, total_time_minutes asc, dish.id asc`, and there is no randomness
 * or hidden state — the same input always yields the same ranked output and the
 * same `reason` strings.
 */

import { unionAllergies } from "./allergens";
import { RECOMMENDATION_CONFIG } from "./config";
import { effectiveDietType } from "./diet";
import { buildReason } from "./explanation";
import { hardFilterExclusion } from "./hard-filters";
import { isWeekend } from "./mealtimes";
import { prepFeasibility } from "./prep";
import {
  aggregateMemberPreferences,
  resolveCookingTimeLimit,
  scoreDish,
} from "./scoring";
import type {
  CandidateDish,
  FactorLabel,
  MissingConstraint,
  Recommendation,
  ScoredFactor,
  SlotRecommendationInput,
} from "./types";

interface ScoredCandidate {
  dish: CandidateDish;
  score: number;
  factors: ScoredFactor[];
}

/**
 * Rank the active candidate dishes for one slot and return the top-N output
 * contract (design/05 § 9). The list is empty when no candidate survives the
 * hard filters.
 */
export function recommendSlot(
  input: SlotRecommendationInput,
): Recommendation[] {
  const config = input.config ?? RECOMMENDATION_CONFIG;
  const usedThisRun = input.usedThisRun ?? EMPTY_SET;
  // BUG-027: a household that built its own dish list only ever gets its chosen
  // dishes (filtered by slot) — not the full catalog. Gated on the combinations
  // feature so the doc-04 baseline (combinations off) is unchanged, and on the
  // household having chosen anything so "let the system decide" still uses the
  // whole catalog.
  const restrictToChosen =
    config.combinations.enabled && input.household.chosenDishIds.size > 0;
  const allowInfeasiblePrep = input.allowInfeasiblePrep ?? false;
  const weekend = isWeekend(input.date);
  const cookingTimeLimit = resolveCookingTimeLimit(input.household, weekend);
  const effectiveDiet = effectiveDietType(input.household, input.members);
  const allergyTerms = unionAllergies(input.members);
  const memberAggregate = aggregateMemberPreferences(input.members);

  const scored: ScoredCandidate[] = [];

  for (const dish of input.dishes) {
    const exclusion = hardFilterExclusion(dish, {
      effectiveDiet,
      allergyTerms,
      mealSlot: input.mealSlot,
      dishSuitableSlots: input.household.dishSuitableSlots,
      restrictToChosen,
      chosenDishIds: input.household.chosenDishIds,
      allowInfeasiblePrep,
      date: input.date,
      now: input.now,
      history: input.history,
      config,
    });
    if (exclusion !== null) continue;

    // Prep is `none`/`deferrable`, or `impossible` when the picker opted in
    // (`allowInfeasiblePrep`). Treat an opted-in `impossible` as `deferrable` for
    // scoring so the dish takes the missing-prep penalty + caveat instead of being
    // dropped or scored as if no prep were needed (BUG-031).
    const prep = prepFeasibility(
      dish,
      input.date,
      input.mealSlot,
      input.now,
      config,
    );
    const prepOutcome =
      allowInfeasiblePrep && prep.outcome === "impossible"
        ? "deferrable"
        : prep.outcome;

    const factors = scoreDish(dish, {
      household: input.household,
      memberAggregate,
      history: input.history,
      usedThisRun,
      mealSlot: input.mealSlot,
      weekend,
      cookingTimeLimit,
      prepOutcome,
      recentPrimaryIngredientIds:
        input.history.recentPrimaryIngredientIds ?? EMPTY_SET,
      popularCombinationDishIds: input.popularCombinationDishIds ?? EMPTY_SET,
      config,
    });

    const score = factors.reduce((sum, f) => sum + f.weight, 0);
    scored.push({ dish, score, factors });
  }

  scored.sort(compareCandidates);

  return scored.slice(0, config.topN).map((candidate) =>
    toRecommendation(candidate, {
      household: input.household,
      mealSlot: input.mealSlot,
      cookingTimeLimit,
    }),
  );
}

const EMPTY_SET: ReadonlySet<string> = new Set<string>();

/** Stable ordering: score desc, then total time asc (nulls last), then id asc. */
function compareCandidates(a: ScoredCandidate, b: ScoredCandidate): number {
  if (a.score !== b.score) return b.score - a.score;
  const at = a.dish.totalTimeMinutes ?? Number.POSITIVE_INFINITY;
  const bt = b.dish.totalTimeMinutes ?? Number.POSITIVE_INFINITY;
  if (at !== bt) return at - bt;
  return a.dish.id < b.dish.id ? -1 : a.dish.id > b.dish.id ? 1 : 0;
}

/** The negative factors that fired, mapped to output-contract caveats (§9). */
const MISSING_CONSTRAINTS: Partial<
  Record<FactorLabel, { type: string; label: string }>
> = {
  recentlyRejected: {
    type: "recentlyRejected",
    label: "Recently rejected by your household",
  },
  recentlyCookedWithinGap: {
    type: "recentlyCooked",
    label: "Cooked recently",
  },
  missingRequiredPrep: {
    type: "missingPrep",
    label: "Needs advance prep before cooking",
  },
  exceedsCookingTime: {
    type: "exceedsCookingTime",
    label: "Takes longer than your usual cooking time",
  },
  highDifficultyOnWeekday: {
    type: "highDifficulty",
    label: "Higher effort for a weekday",
  },
  ingredientRepetition: {
    type: "ingredientRepetition",
    label: "Repeats a main ingredient used recently",
  },
};

function toRecommendation(
  candidate: ScoredCandidate,
  ctx: {
    household: SlotRecommendationInput["household"];
    mealSlot: SlotRecommendationInput["mealSlot"];
    cookingTimeLimit: number | null;
  },
): Recommendation {
  const missingConstraints: MissingConstraint[] = [];
  for (const factor of candidate.factors) {
    const mapping = MISSING_CONSTRAINTS[factor.label];
    if (mapping && factor.weight < 0) {
      missingConstraints.push({ ...mapping, weight: factor.weight });
    }
  }

  return {
    dishId: candidate.dish.id,
    score: candidate.score,
    reason: buildReason(candidate.factors, {
      dish: candidate.dish,
      household: ctx.household,
      mealSlot: ctx.mealSlot,
      cookingTimeLimit: ctx.cookingTimeLimit,
    }),
    missingConstraints,
    prepTasks: candidate.dish.prepTasks.map((task) => ({
      taskName: task.taskName,
      requiredBeforeMinutes: task.requiredBeforeMinutes,
      description: task.description,
    })),
    pairedDishes: candidate.dish.pairings.map((pairing) => ({
      dishId: pairing.dishId,
      pairingType: pairing.pairingType,
    })),
  };
}
