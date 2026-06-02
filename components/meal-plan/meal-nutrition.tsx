import { Flame } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  formatServing,
  giBand,
  giBandLabel,
  hasNutrition,
  sumNutrition,
  type DishNutrition,
  type GiBand,
  type NutritionTotals,
} from "@/lib/meal-plan/nutrition";
import type {
  MealPlanItemDto,
  PairedDishDto,
} from "@/lib/services/meal-plan/dto";
import { cn } from "@/lib/utils";

/**
 * Per-meal nutrition strip (P11). Shows the calories + macros for the whole plate
 * (main dish **plus** its paired sides), the serving the main is measured in (with
 * a "+ N sides" hint so the calorie total isn't misread as the main's serving
 * alone), and a Low/Med/High glycemic-index band for the main dish. All values are
 * estimates and per person — never a medical claim (CLAUDE.md, docs/10).
 *
 * Renders nothing when there's no nutrition data at all, so a dish without a
 * profile (or an eating-out slot) simply shows nothing rather than zeros.
 */

const GI_BADGE_VARIANT: Record<GiBand, "emerald" | "marigold" | "ember"> = {
  low: "emerald",
  medium: "marigold",
  high: "ember",
};

/** `12g` etc., rounded to the nearest gram; drops a zero to keep the strip terse. */
function grams(value: number): string {
  return `${Math.round(value)}g`;
}

/**
 * Shared calories + macros figures, used by both the per-meal strip and the daily
 * summary so the rounding rule and macro labels can't drift between them. `full`
 * spells out Protein/Carbs/Fat and renders the calories larger.
 */
function NutritionFigures({
  totals,
  full = false,
}: {
  totals: NutritionTotals;
  full?: boolean;
}) {
  return (
    <>
      <span
        className={cn(
          "inline-flex items-center gap-1",
          full ? "gap-1.5 font-heading text-lg font-bold" : "font-semibold",
        )}
      >
        <Flame
          className={cn(
            "text-saffron-foreground",
            full ? "size-4" : "size-3.5",
          )}
        />
        {Math.round(totals.calories)} kcal
      </span>
      <span className="text-sm text-muted-foreground">
        {full ? "Protein" : "P"} {grams(totals.proteinG)} ·{" "}
        {full ? "Carbs" : "C"} {grams(totals.carbsG)} · {full ? "Fat" : "F"}{" "}
        {grams(totals.fatG)}
      </span>
    </>
  );
}

export function MealNutrition({
  nutrition,
  pairedDishes = [],
  className,
}: {
  nutrition: DishNutrition | null;
  pairedDishes?: PairedDishDto[];
  className?: string;
}) {
  const totals = sumNutrition([
    nutrition,
    ...pairedDishes.map((p) => p.nutrition),
  ]);

  // The serving describes the *main* dish; GI is the main's. The calorie/macro
  // total is the whole plate, so when sides contribute we note them next to the
  // serving rather than letting "1 bowl" read as the combined figure (BUG fix).
  const serving = formatServing(nutrition?.servingQty, nutrition?.servingUnit);
  const band = giBand(nutrition?.glycemicIndex);
  const sideCount = pairedDishes.filter((p) =>
    hasNutrition(p.nutrition),
  ).length;

  // Show whenever there's anything worth showing — macros, a serving, or a GI
  // band — so a genuine 0-calorie item (known serving/GI) still renders.
  if (!hasNutrition(totals) && !serving && !band) return null;

  const servingLabel = serving
    ? sideCount > 0
      ? `${serving} + ${sideCount} ${sideCount === 1 ? "side" : "sides"}`
      : serving
    : null;

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm",
        className,
      )}
    >
      <NutritionFigures totals={totals} />
      {servingLabel ? (
        <span className="text-muted-foreground">{servingLabel}</span>
      ) : null}
      {band ? (
        <Badge
          variant={GI_BADGE_VARIANT[band]}
          title={
            nutrition?.glycemicIndex != null
              ? `Estimated glycemic index ${nutrition.glycemicIndex}`
              : undefined
          }
        >
          GI {giBandLabel(band)}
        </Badge>
      ) : null}
    </div>
  );
}

/**
 * Daily totals across the household's planned slots (P11). Sums calories + macros
 * for every passed meal (each = main + sides). GI is intentionally omitted —
 * averaging glycemic index across a day is misleading. Callers pass the meals that
 * should count (e.g. excluding rejected/eating-out slots). Renders nothing until
 * at least one carries nutrition data.
 */
export function DailyNutritionSummary({
  items,
  className,
}: {
  items: MealPlanItemDto[];
  className?: string;
}) {
  const totals = sumNutrition(
    items.flatMap((item) => [
      item.nutrition,
      ...item.pairedDishes.map((p) => p.nutrition),
    ]),
  );
  if (!hasNutrition(totals)) return null;

  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-lg border bg-card px-4 py-3 text-card-foreground shadow-xs",
        className,
      )}
    >
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <span className="text-xs font-bold tracking-[0.16em] text-muted-foreground uppercase">
          Daily total · per person
        </span>
        <NutritionFigures totals={totals} full />
      </div>
      <span className="text-xs text-muted-foreground">
        Estimated values for dietary reference only.
      </span>
    </div>
  );
}
