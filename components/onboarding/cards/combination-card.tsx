"use client";

import { Check } from "lucide-react";

import { FoodImage } from "@/components/ui/food-image";
import type { CombinationCatalogItem } from "@/lib/services/onboarding/list-combination-catalog";
import { cn } from "@/lib/utils";

/**
 * A selectable meal-combination card (P10) for the "Select combinations" mode: the
 * combo name + the dishes that make it up (a row of thumbnails with labels), with
 * a check when selected. The header/thumbnail area toggles selection
 * (`aria-pressed`); an optional `footer` renders the per-combination config
 * (frequency, "suitable for") under the selected card — mirroring `DishCard`
 * (P10-9). The footer lives outside the toggle button so its controls aren't
 * nested inside a button.
 */
export function CombinationCard({
  combination,
  selected,
  onToggle,
  footer,
}: {
  combination: CombinationCatalogItem;
  selected: boolean;
  onToggle: () => void;
  footer?: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex flex-col overflow-hidden rounded-lg border transition-colors",
        selected
          ? "border-primary bg-primary/10"
          : "border-border bg-card hover:border-primary/30 hover:bg-primary/5",
      )}
    >
      <button
        type="button"
        aria-pressed={selected}
        onClick={onToggle}
        className="flex w-full flex-col gap-3 p-3 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/25"
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

        {/*
         * The dish images carry the visual; the combination name + description
         * above already name the plate, so we don't repeat each dish name as a
         * caption (that read as the name appearing twice — BUG-025). The dish
         * name stays available to assistive tech via the image alt text. The
         * thumbnails fill a 3-up grid so they're as prominent as the build-mode
         * DishCard images rather than the old 4rem chips (BUG-025).
         */}
        <ul className="grid grid-cols-3 gap-2">
          {combination.dishes.map((dish) => (
            <li key={dish.id}>
              <FoodImage
                kind="dish"
                src={dish.imageUrl}
                status={dish.imageStatus}
                altText={dish.imageAltText ?? dish.name}
                className="w-full"
                sizes="(max-width: 640px) 30vw, 8rem"
              />
            </li>
          ))}
        </ul>
      </button>
      {selected && footer ? (
        <div className="border-t border-primary/20 p-3">{footer}</div>
      ) : null}
    </div>
  );
}
