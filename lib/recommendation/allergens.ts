/**
 * Allergen hard filter (design/05 § 4) — absolute, never merely penalized.
 *
 * Active members' `allergies` are unioned into one household-wide exclusion set;
 * a dish is excluded if **any** ingredient — required OR optional — matches an
 * allergy term by name, common name, or allergen type. Matching is whole-word
 * (see `./text-match.ts`) so "egg" excludes egg but not eggplant.
 *
 * Pure, no I/O.
 */

import { ingredientMatchesAnyTerm, normalizeTerm } from "./text-match";
import type { CandidateDish, MemberContext } from "./types";

/** The deduped, normalized union of every active member's allergies. */
export function unionAllergies(members: readonly MemberContext[]): string[] {
  const set = new Set<string>();
  for (const member of members) {
    for (const allergy of member.allergies) {
      const normalized = normalizeTerm(allergy);
      if (normalized.length > 0) set.add(normalized);
    }
  }
  return [...set];
}

/**
 * True when `dish` contains an ingredient matching any of `allergyTerms`
 * (required or optional). Empty `allergyTerms` → never an allergen.
 */
export function containsAllergen(
  dish: CandidateDish,
  allergyTerms: readonly string[],
): boolean {
  if (allergyTerms.length === 0) return false;
  return dish.ingredients.some((ing) =>
    ingredientMatchesAnyTerm(ing, allergyTerms),
  );
}
