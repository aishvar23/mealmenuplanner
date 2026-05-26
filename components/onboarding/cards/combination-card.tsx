"use client";

import { Check } from "lucide-react";

import { FoodImage } from "@/components/ui/food-image";
import type { CombinationCatalogItem } from "@/lib/services/onboarding/list-combination-catalog";
import { cn } from "@/lib/utils";

/**
 * A selectable meal-combination card (P10) for the "Select combinations" mode: the
 * combo name + the dishes that make it up (a row of thumbnails with labels), with
 * a check when selected. The whole card toggles selection (`aria-pressed`).
 */
export function CombinationCard({
  combination,
  selected,
  onToggle,
}: {
  combination: CombinationCatalogItem;
  selected: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onToggle}
      className={cn(
        "flex w-full flex-col gap-3 rounded-lg border p-3 text-left transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/25",
        selected
          ? "border-primary bg-primary/10"
          : "border-border bg-card hover:border-primary/30 hover:bg-primary/5",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <span className="block font-heading text-base font-bold">
            {combination.name}
          </span>
          {combination.description ? (
            <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">
              {combination.description}
            </span>
          ) : null}
        </div>
        <span
          className={cn(
            "flex size-6 shrink-0 items-center justify-center rounded-full border",
            selected
              ? "border-primary bg-primary text-primary-foreground"
              : "border-border text-transparent",
          )}
          aria-hidden
        >
          <Check className="size-4" />
        </span>
      </div>

      <ul className="flex flex-wrap gap-2">
        {combination.dishes.map((dish) => (
          <li key={dish.id} className="flex w-16 flex-col items-center gap-1">
            <FoodImage
              kind="dish"
              src={dish.imageUrl}
              status={dish.imageStatus}
              altText={dish.imageAltText ?? dish.name}
              className="w-16"
              sizes="4rem"
            />
            <span className="line-clamp-2 text-center text-[11px] leading-tight text-muted-foreground">
              {dish.name}
            </span>
          </li>
        ))}
      </ul>
    </button>
  );
}
