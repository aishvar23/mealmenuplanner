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
  HouseholdContext,
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
 * The effective household diet: the household's, tightened by any strictly
 * stricter active member override. Ties (including vegan-vs-jain) keep the
 * household's diet.
 */
export function effectiveDietType(
  household: HouseholdContext,
  members: readonly MemberContext[],
): DietType {
  let effective = household.dietType;
  for (const member of members) {
    if (member.dietType === null) continue;
    if (DIET_STRICTNESS[member.dietType] > DIET_STRICTNESS[effective]) {
      effective = member.dietType;
    }
  }
  return effective;
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
