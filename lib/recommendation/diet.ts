/**
 * Diet compatibility — the hard-filter diet rule (design/05 § 4) as an explicit,
 * tunable lookup, never a guess. Two parts:
 *
 *  1. **Diet-type matrix.** For the effective household diet, which dish
 *     `diet_type` values are acceptable. The effective diet is the household's,
 *     tightened by the strictest active member override (§4, §3.2).
 *  2. **Ingredient refinement** for the two diets the doc calls out explicitly:
 *     a `vegan` household excludes vegetarian/jain dishes that contain
 *     dairy/egg ingredients; a `jain` household excludes dishes containing
 *     onion/garlic. Both keyword/category sets live in config so they are tunable.
 *
 * Pure, no I/O.
 */

import type { RecommendationConfig } from "./config";
import { ingredientMatchesAnyTerm } from "./text-match";
import type {
  CandidateDish,
  CandidateIngredient,
  DietType,
  MemberContext,
} from "./types";

/**
 * Which dish `diet_type` values each household diet accepts (design/05 § 4).
 * `vegan` and `jain` allow the broader veg set here, then narrow by ingredient
 * (a dairy-free vegetarian dish is vegan-acceptable; a jain dish has no
 * onion/garlic). `non_vegetarian` accepts everything.
 */
const ALLOWED_DISH_DIETS: Record<DietType, readonly DietType[]> = {
  non_vegetarian: [
    "vegetarian",
    "vegan",
    "eggetarian",
    "non_vegetarian",
    "jain",
    "pescatarian",
  ],
  pescatarian: ["vegetarian", "vegan", "eggetarian", "jain", "pescatarian"],
  eggetarian: ["vegetarian", "vegan", "eggetarian", "jain"],
  vegetarian: ["vegetarian", "vegan", "jain"],
  vegan: ["vegetarian", "vegan", "jain"],
  jain: ["vegetarian", "vegan", "jain"],
};

/**
 * Strictness rank — higher excludes more. Used to pick the effective diet when
 * members override the household. `vegan` and `jain` are both maximally strict
 * but along different axes (dairy/egg vs onion/garlic) and are not directly
 * comparable; ties keep the household's own diet, and the allergy union applies
 * regardless. A documented MVP simplification (design/05 § 4).
 */
const DIET_STRICTNESS: Record<DietType, number> = {
  non_vegetarian: 0,
  pescatarian: 1,
  eggetarian: 2,
  vegetarian: 3,
  jain: 4,
  vegan: 4,
};

/**
 * The strictest active member diet override, or `null` when no member overrides
 * the household. Used to tighten — never widen — the household's diet set: a dish
 * must satisfy this member on top of the household match (see
 * {@link isDietCompatibleWithHousehold}). Ties (including vegan-vs-jain) resolve
 * to the first-seen, which is immaterial since both narrow by ingredient anyway.
 */
export function strictestMemberDiet(
  members: readonly MemberContext[],
): DietType | null {
  let strictest: DietType | null = null;
  for (const member of members) {
    if (member.dietType === null) continue;
    if (
      strictest === null ||
      DIET_STRICTNESS[member.dietType] > DIET_STRICTNESS[strictest]
    ) {
      strictest = member.dietType;
    }
  }
  return strictest;
}

/** True when any dish ingredient (required OR optional) is non-vegan. */
function hasNonVeganIngredient(
  ingredients: readonly CandidateIngredient[],
  config: RecommendationConfig,
): boolean {
  const categories = config.diet.nonVeganCategories;
  return ingredients.some(
    (ing) =>
      categories.includes(ing.category) ||
      ingredientMatchesAnyTerm(ing, config.diet.nonVeganTerms),
  );
}

/** True when any dish ingredient is onion/garlic-family (jain-excluded). */
function hasJainExcludedIngredient(
  ingredients: readonly CandidateIngredient[],
  config: RecommendationConfig,
): boolean {
  return ingredients.some((ing) =>
    ingredientMatchesAnyTerm(ing, config.diet.jainExcludedTerms),
  );
}

/**
 * Is `dish` compatible with the `effectiveDiet`? Diet-type matrix first, then
 * the vegan (no dairy/egg) and jain (no onion/garlic) ingredient refinements.
 */
export function isDietCompatible(
  dish: CandidateDish,
  effectiveDiet: DietType,
  config: RecommendationConfig,
): boolean {
  if (!ALLOWED_DISH_DIETS[effectiveDiet].includes(dish.dietType)) {
    return false;
  }
  if (
    effectiveDiet === "vegan" &&
    hasNonVeganIngredient(dish.ingredients, config)
  ) {
    return false;
  }
  if (
    effectiveDiet === "jain" &&
    hasJainExcludedIngredient(dish.ingredients, config)
  ) {
    return false;
  }
  return true;
}

/**
 * Is `dish` compatible with a household that selected **one or more** diets
 * (BETA — multi-diet households)? A household eating both vegetarian and
 * non-vegetarian, say, should see dishes for *either*, so the rule is a **union**:
 * the dish passes if it is compatible with **some** selected household diet.
 *
 * A `strictestMember` override (if any) is then applied as an additional AND
 * filter so a member's dietary restriction still narrows — never widens — the
 * result: e.g. a vegan member in a veg+non-veg household keeps only vegan-safe
 * dishes. When the strictest member is *less* strict than the household's diets,
 * the extra check is a no-op (their allowed set is a superset), so it can be
 * applied unconditionally. `householdDiets` is assumed non-empty (DB CHECK).
 */
export function isDietCompatibleWithHousehold(
  dish: CandidateDish,
  householdDiets: readonly DietType[],
  strictestMember: DietType | null,
  config: RecommendationConfig,
): boolean {
  const matchesHousehold = householdDiets.some((diet) =>
    isDietCompatible(dish, diet, config),
  );
  if (!matchesHousehold) return false;
  if (strictestMember !== null) {
    return isDietCompatible(dish, strictestMember, config);
  }
  return true;
}
