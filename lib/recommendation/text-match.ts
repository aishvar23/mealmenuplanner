/**
 * Case-insensitive, whole-word term matching shared by the diet and allergen
 * filters (design/05 § 4). Ingredient names and member-entered allergies/dislikes
 * are free text, so matching must be tolerant of case and surrounding words but
 * **not** match substrings of unrelated words — e.g. the allergy "egg" must not
 * exclude "eggplant". Whole-word boundaries (non-alphanumeric or string edges)
 * give that: "egg" matches "egg" and "egg white" but not "eggplant", while
 * "peanut" still matches "peanut oil".
 *
 * Pure, no I/O — safe to unit-test directly.
 */

/** Lowercase + trim a free-text term. */
export function normalizeTerm(value: string): string {
  return value.trim().toLowerCase();
}

const REGEX_SPECIALS = /[.*+?^${}()|[\]\\]/g;

/**
 * True when `term` appears as a whole word in `haystack` (case-insensitive),
 * or the two are equal after normalization. An empty/blank term never matches.
 */
export function containsWord(haystack: string, term: string): boolean {
  const t = normalizeTerm(term);
  if (t.length === 0) return false;
  const h = normalizeTerm(haystack);
  if (h === t) return true;
  const escaped = t.replace(REGEX_SPECIALS, "\\$&");
  return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`).test(h);
}

/** The fields of an ingredient that term-matching inspects. */
export interface MatchableIngredient {
  name: string;
  commonNames: string[];
  allergenType: string | null;
}

/**
 * True when an ingredient matches any of `terms` by its name, a common name, or
 * its allergen type (design/05 § 4 allergy rule). All comparisons are whole-word.
 */
export function ingredientMatchesAnyTerm(
  ingredient: MatchableIngredient,
  terms: readonly string[],
): boolean {
  for (const term of terms) {
    if (containsWord(ingredient.name, term)) return true;
    if (ingredient.commonNames.some((c) => containsWord(c, term))) return true;
    if (
      ingredient.allergenType !== null &&
      containsWord(ingredient.allergenType, term)
    ) {
      return true;
    }
  }
  return false;
}
