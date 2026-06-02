/**
 * Nutrition domain helpers for the meal-planning UI (P11). Pure and client-safe:
 * the shared per-serving shape, the GI band classifier, the serving-size
 * formatter, and the macro summer used for per-meal (main + pairings) and daily
 * totals.
 *
 * Values are **estimates** anchored to one human-scaled serving (a plate of
 * biryani vs a bowl of dal) — display only, never a medical claim (CLAUDE.md,
 * docs/10). Every field is independently nullable: a dish with no data renders no
 * nutrition rather than zeros.
 */

import type { Database } from "@/lib/db/database.types";

export type ServingUnit = Database["public"]["Enums"]["serving_unit"];

/** A dish's per-serving nutrition profile (P11). Any field may be unknown. */
export interface DishNutrition {
  /** Size of one serving in {@link servingUnit} terms (e.g. 1 plate, 2 pieces). */
  servingQty: number | null;
  servingUnit: ServingUnit | null;
  calories: number | null;
  proteinG: number | null;
  carbsG: number | null;
  fatG: number | null;
  /** Estimated glycemic index (0–110); shown as a band, not a number, by default. */
  glycemicIndex: number | null;
}

/** Summable macros (GI is excluded — averaging glycemic index is misleading). */
export interface NutritionTotals {
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}

/** The snake_case nutrition columns as projected from the `dishes` table. */
export interface DishNutritionRow {
  serving_qty: number | null;
  serving_unit: ServingUnit | null;
  calories_kcal: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
  glycemic_index: number | null;
}

/** Map the dish nutrition columns to the camelCase {@link DishNutrition} shape. */
export function toDishNutrition(row: DishNutritionRow): DishNutrition {
  return {
    servingQty: row.serving_qty,
    servingUnit: row.serving_unit,
    calories: row.calories_kcal,
    proteinG: row.protein_g,
    carbsG: row.carbs_g,
    fatG: row.fat_g,
    glycemicIndex: row.glycemic_index,
  };
}

export type GiBand = "low" | "medium" | "high";

/**
 * Classify a glycemic index into the conventional Low (≤55) / Med (56–69) /
 * High (≥70) bands. `null` for an unknown GI so the UI can omit the chip.
 */
export function giBand(gi: number | null | undefined): GiBand | null {
  if (gi === null || gi === undefined) return null;
  if (gi <= 55) return "low";
  if (gi <= 69) return "medium";
  return "high";
}

const GI_BAND_LABELS: Record<GiBand, string> = {
  low: "Low",
  medium: "Med",
  high: "High",
};

export function giBandLabel(band: GiBand): string {
  return GI_BAND_LABELS[band];
}

const SERVING_UNIT_LABELS: Record<
  ServingUnit,
  { singular: string; plural: string }
> = {
  cup: { singular: "cup", plural: "cups" },
  bowl: { singular: "bowl", plural: "bowls" },
  plate: { singular: "plate", plural: "plates" },
  glass: { singular: "glass", plural: "glasses" },
  piece: { singular: "pc", plural: "pcs" },
};

/**
 * Human serving label, e.g. `"1 plate"`, `"2 pcs"`, `"1.5 cups"`. Returns `null`
 * when the quantity or unit is unknown (no serving anchor to show).
 */
export function formatServing(
  qty: number | null | undefined,
  unit: ServingUnit | null | undefined,
): string | null {
  if (qty === null || qty === undefined || !unit) return null;
  const { singular, plural } = SERVING_UNIT_LABELS[unit];
  const label = qty === 1 ? singular : plural;
  return `${String(qty)} ${label}`;
}

/**
 * Sum the macros across a set of profiles, skipping `null`/absent entries. Used
 * for a meal's main + paired sides and for the day's total. A field stays `0` if
 * no contributor had a value; callers decide whether an all-zero total is worth
 * rendering (see {@link hasNutrition}).
 */
export function sumNutrition(
  profiles: ReadonlyArray<DishNutrition | null | undefined>,
): NutritionTotals {
  const total: NutritionTotals = {
    calories: 0,
    proteinG: 0,
    carbsG: 0,
    fatG: 0,
  };
  for (const p of profiles) {
    if (!p) continue;
    total.calories += p.calories ?? 0;
    total.proteinG += p.proteinG ?? 0;
    total.carbsG += p.carbsG ?? 0;
    total.fatG += p.fatG ?? 0;
  }
  return total;
}

/** Whether a profile carries any macro/calorie data worth rendering. */
export function hasNutrition(
  n: DishNutrition | NutritionTotals | null | undefined,
): boolean {
  if (!n) return false;
  return (
    (n.calories ?? 0) > 0 ||
    (n.proteinG ?? 0) > 0 ||
    (n.carbsG ?? 0) > 0 ||
    (n.fatG ?? 0) > 0
  );
}
