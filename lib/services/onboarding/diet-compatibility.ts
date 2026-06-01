import type { Database } from "@/lib/db/database.types";

type DietType = Database["public"]["Enums"]["diet_type"];

/**
 * Diet → the `diet_type`s safe to *offer* a household on that diet, mirroring the
 * engine's diet hierarchy (lib/recommendation/diet.ts) without scanning
 * ingredients. Shared by the onboarding catalogs (dishes, combinations,
 * accompaniments) so the preferred-dish step never offers a household something
 * incompatible with its diet (BUG-006). A missing/unknown diet means "show
 * everything" (the caller skips the filter).
 */
export const DIET_COMPATIBILITY: Record<DietType, DietType[]> = {
  vegan: ["vegan"],
  vegetarian: ["vegetarian", "vegan", "jain"],
  jain: ["jain"],
  eggetarian: ["eggetarian", "vegetarian", "vegan", "jain"],
  pescatarian: ["pescatarian", "vegetarian", "vegan", "eggetarian", "jain"],
  non_vegetarian: [
    "non_vegetarian",
    "pescatarian",
    "eggetarian",
    "vegetarian",
    "vegan",
    "jain",
  ],
};

/**
 * The diet types compatible with `diet`, or `null` when `diet` is missing or
 * names no known diet type (so the caller offers the full active catalog).
 *
 * `diet` may be a single diet or a comma-separated list (multi-diet households,
 * BETA) — the result is the **union** of each known diet's compatible set, so a
 * "vegetarian,non_vegetarian" household sees dishes for either.
 */
export function allowedDietsFor(diet?: string | null): DietType[] | null {
  if (!diet) return null;
  const known = diet
    .split(",")
    .map((d) => d.trim())
    .filter((d): d is DietType => d in DIET_COMPATIBILITY);
  if (known.length === 0) return null;

  const union = new Set<DietType>();
  for (const d of known) {
    for (const allowed of DIET_COMPATIBILITY[d]) union.add(allowed);
  }
  return [...union];
}
