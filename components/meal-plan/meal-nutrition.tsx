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
} from "@/lib/meal-plan/nutrition";
import type { PairedDishDto } from "@/lib/services/meal-plan/dto";
import { cn } from "@/lib/utils";

/**
 * Per-meal nutrition strip (P11). Shows the serving the figures are anchored to,
 * the calories + macros for the whole plate (main dish **plus** its paired
 * sides), and a Low/Med/High glycemic-index band for the main dish. All values
 * are estimates and per person — never a medical claim (CLAUDE.md, docs/10).
 *
 * Renders nothing when there's no nutrition data, so a dish without a profile (or
 * an eating-out slot) simply shows nothing rather than zeros.
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
  if (!hasNutrition(totals)) return null;

  // Serving + GI describe the *main* dish (the anchor); macros are the whole plate.
  const serving = formatServing(nutrition?.servingQty, nutrition?.servingUnit);
  const band = giBand(nutrition?.glycemicIndex);

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm",
        className,
      )}
    >
      <span className="inline-flex items-center gap-1 font-semibold">
        <Flame className="size-3.5 text-saffron-foreground" />
        {Math.round(totals.calories)} kcal
      </span>
      {serving ? (
        <span className="text-muted-foreground">per {serving}</span>
      ) : null}
      <span className="text-muted-foreground">
        P {grams(totals.proteinG)} · C {grams(totals.carbsG)} · F{" "}
        {grams(totals.fatG)}
      </span>
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

/** One meal's contribution to the day — its main dish plus paired sides. */
export interface DailyNutritionItem {
  nutrition: DishNutrition | null;
  pairedDishes: PairedDishDto[];
}

/**
 * Daily totals across the household's planned slots (P11). Sums calories + macros
 * for every meal (each = main + sides). GI is intentionally omitted — averaging
 * glycemic index across a day is misleading. Renders nothing until at least one
 * planned dish carries nutrition data.
 */
export function DailyNutritionSummary({
  items,
  className,
}: {
  items: DailyNutritionItem[];
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
        <span className="inline-flex items-center gap-1.5 font-heading text-lg font-bold">
          <Flame className="size-4 text-saffron-foreground" />
          {Math.round(totals.calories)} kcal
        </span>
        <span className="text-sm text-muted-foreground">
          Protein {grams(totals.proteinG)} · Carbs {grams(totals.carbsG)} · Fat{" "}
          {grams(totals.fatG)}
        </span>
      </div>
      <span className="text-xs text-muted-foreground">
        Estimated values for dietary reference only.
      </span>
    </div>
  );
}
