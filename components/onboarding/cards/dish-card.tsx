"use client";

import { Check } from "lucide-react";

import { FoodImage, type FoodImageStatus } from "@/components/ui/food-image";
import { cn } from "@/lib/utils";

/**
 * A selectable dish card (P10) — image on top, name + cuisine below, a check when
 * selected. Replaces the old list-row in the preferred-dishes picker; used for the
 * `build`-mode mains grid (and reusable for the legacy manual picker). Selection
 * is communicated via `aria-pressed`. An optional `footer` renders the per-dish
 * config (frequency, "goes with") under the selected card.
 */
export function DishCard({
  name,
  cuisine,
  imageUrl,
  imageAltText,
  imageStatus,
  selected,
  onToggle,
  footer,
}: {
  name: string;
  cuisine: string | null;
  imageUrl: string | null;
  imageAltText: string | null;
  imageStatus: FoodImageStatus;
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
          : "border-border bg-card hover:border-primary/30",
      )}
    >
      <button
        type="button"
        aria-pressed={selected}
        onClick={onToggle}
        className="flex flex-col gap-2 p-2 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/25"
      >
        <span className="relative block">
          <FoodImage
            kind="dish"
            src={imageUrl}
            status={imageStatus}
            altText={imageAltText ?? name}
            className="w-full"
            sizes="(max-width: 640px) 50vw, 12rem"
          />
          {selected ? (
            <span className="absolute top-1.5 right-1.5 flex size-6 items-center justify-center rounded-full bg-primary text-primary-foreground shadow">
              <Check className="size-4" />
            </span>
          ) : null}
        </span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold">{name}</span>
          {cuisine ? (
            <span className="block truncate text-xs text-muted-foreground">
              {cuisine}
            </span>
          ) : null}
        </span>
      </button>
      {selected && footer ? (
        <div className="border-t border-primary/20 p-3">{footer}</div>
      ) : null}
    </div>
  );
}
