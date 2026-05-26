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
 * The diet types compatible with `diet`, or `null` when `diet` is missing or not
 * a known diet type (so the caller offers the full active catalog).
 */
export function allowedDietsFor(diet?: string | null): DietType[] | null {
  return diet && diet in DIET_COMPATIBILITY
    ? DIET_COMPATIBILITY[diet as DietType]
    : null;
}
