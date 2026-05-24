/**
 * Client-safe display helpers for the grocery UI (P7-2). Pure data + functions,
 * no `server-only` / Supabase / React imports, so the grocery board renders them
 * and the aggregator (`lib/services/grocery/aggregate.ts`) shares the one
 * canonical category order.
 *
 * `ingredients.category` is free `text` in doc 01 (not an enum), so an unknown
 * category is tolerated: it sorts after the known set and is humanized for
 * display rather than dropped.
 */

/**
 * Category display order from design/08 § 9 (the doc-01 stored value set):
 * Vegetables, Fruits, Dairy, Grains, Lentils, Spices, Eggs/meat, Pantry staples.
 */
export const CATEGORY_ORDER = [
  "vegetables",
  "fruits",
  "dairy",
  "grains",
  "lentils",
  "spices",
  "eggs_meat",
  "pantry",
] as const;

const CATEGORY_LABELS: Record<string, string> = {
  vegetables: "Vegetables",
  fruits: "Fruits",
  dairy: "Dairy",
  grains: "Grains",
  lentils: "Lentils",
  spices: "Spices",
  eggs_meat: "Eggs & meat",
  pantry: "Pantry staples",
};

/**
 * Sort rank for a category — its index in {@link CATEGORY_ORDER}, or a value past
 * the end for any unknown category (so unknowns cluster last, then by name).
 */
export function categoryRank(category: string): number {
  const index = CATEGORY_ORDER.indexOf(
    category as (typeof CATEGORY_ORDER)[number],
  );
  return index === -1 ? CATEGORY_ORDER.length : index;
}

/** Human label for a category; humanizes an unknown value rather than dropping it. */
export function categoryLabel(category: string): string {
  return CATEGORY_LABELS[category] ?? humanize(category);
}

/** "eggs_meat" → "Eggs meat"; a readable fallback for an unrecognized category. */
function humanize(value: string): string {
  const cleaned = value.replace(/[_-]+/g, " ").trim();
  if (cleaned.length === 0) return "Other";
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

/**
 * Format a grocery quantity for display: trim trailing zeros from the numeric(10,3)
 * value so "750.000" → "750" and "1.500" → "1.5", then append the unit.
 */
export function formatQuantity(quantity: number, unit: string): string {
  // A JS number stringifies without trailing zeros (750.000 → "750", 1.500 → "1.5").
  const number = String(Math.round(quantity * 1000) / 1000);
  return unit ? `${number} ${unit}` : number;
}
