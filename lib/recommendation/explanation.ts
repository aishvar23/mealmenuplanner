/**
 * Explanation generation (design/05 § 8). A recommendation's `reason` is composed
 * **deterministically from the winning positive factors** recorded during scoring
 * (§5): collect the factors that fired with a positive weight, order them by
 * weight (highest first, with a fixed tiebreak so it is stable), map each to a
 * phrase fragment, and join into one sentence.
 *
 * Negative factors are never narrated here — the user is being shown an accepted
 * suggestion; caveats surface separately as `missingConstraints` (§9). Because
 * the factor set and order are deterministic, the same dish/household/date always
 * yields the same sentence (the doc's example sentence is illustrative; this
 * generator's canonical order is weight-descending).
 *
 * Pure, no I/O.
 */

import type {
  CandidateDish,
  FactorLabel,
  HouseholdContext,
  MealSlot,
  ScoredFactor,
} from "./types";

/** Context the phrase builders read for data-dependent fragments. */
export interface ReasonContext {
  dish: CandidateDish;
  household: HouseholdContext;
  mealSlot: MealSlot;
  /** The applicable cooking-time limit, for the "fits your N-minute window" phrase. */
  cookingTimeLimit: number | null;
}

/**
 * Canonical tiebreak order for equal-weight positive factors (e.g. cuisine and
 * cooking-time both +30). Primary sort is weight descending; this index breaks
 * ties so the sentence is stable.
 */
const POSITIVE_FACTOR_ORDER = [
  "dietMatch",
  "householdChosenDish",
  "mealSlotMatch",
  "frequencyDaily",
  "notRepeatedRecently",
  "cuisineMatch",
  "cookingTimeWithinLimit",
  "kidFriendlyWhenKids",
  "lunchboxFriendlyForLunch",
  "popularDish",
  "preferredIngredient",
] as const;

type PositiveFactorLabel = (typeof POSITIVE_FACTOR_ORDER)[number];

const PHRASES: Record<PositiveFactorLabel, (ctx: ReasonContext) => string> = {
  dietMatch: (ctx) => `it is ${formatDiet(ctx.dish.dietType)}`,
  householdChosenDish: () => "it is one your household chose",
  mealSlotMatch: (ctx) => `works well for ${ctx.mealSlot}`,
  notRepeatedRecently: (ctx) =>
    `has not been repeated ${varietyPhrase(ctx.household.varietyGapDays)}`,
  cuisineMatch: (ctx) => `matches your ${ctx.dish.cuisine} cuisine preference`,
  cookingTimeWithinLimit: (ctx) =>
    `fits your ${ctx.cookingTimeLimit}-minute cooking window`,
  kidFriendlyWhenKids: () => "is kid-friendly",
  lunchboxFriendlyForLunch: () => "packs well in a lunchbox",
  frequencyDaily: () => "is one of your everyday staples",
  popularDish: () => "is a popular choice",
  preferredIngredient: () => "is a dish your household likes",
};

const POSITIVE_LABELS = new Set<FactorLabel>(POSITIVE_FACTOR_ORDER);

/** Build the human-readable `reason` from the factors that fired (design/05 § 8). */
export function buildReason(
  factors: readonly ScoredFactor[],
  ctx: ReasonContext,
): string {
  const positives = factors
    .filter(
      (f): f is ScoredFactor & { label: PositiveFactorLabel } =>
        f.weight > 0 && POSITIVE_LABELS.has(f.label),
    )
    .sort(
      (a, b) =>
        b.weight - a.weight ||
        POSITIVE_FACTOR_ORDER.indexOf(a.label) -
          POSITIVE_FACTOR_ORDER.indexOf(b.label),
    );

  if (positives.length === 0) return "Suggested for this meal.";

  const fragments = positives.map((f) => PHRASES[f.label](ctx));
  return `Suggested because ${joinWithAnd(fragments)}.`;
}

/** "vegetarian" / "non-vegetarian" — display form of a diet enum value. */
function formatDiet(diet: string): string {
  return diet.replace(/_/g, "-");
}

/** Phrase the variety window for the reason sentence. */
function varietyPhrase(gapDays: number): string {
  if (gapDays <= 0) return "recently";
  if (gapDays === 7) return "this week";
  return `in the last ${gapDays} ${gapDays === 1 ? "day" : "days"}`;
}

/** Oxford-comma join: ["a"]→"a", ["a","b"]→"a and b", ["a","b","c"]→"a, b, and c". */
function joinWithAnd(parts: string[]): string {
  if (parts.length <= 1) return parts.join("");
  if (parts.length === 2) return parts.join(" and ");
  const last = parts[parts.length - 1] ?? "";
  return `${parts.slice(0, -1).join(", ")}, and ${last}`;
}
