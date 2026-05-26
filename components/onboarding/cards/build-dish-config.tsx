"use client";

import { Plus, X } from "lucide-react";
import { useMemo, useState } from "react";

import { Input } from "@/components/ui/input";
import type { Database } from "@/lib/db/database.types";
import type { DishCatalogItem } from "@/lib/services/onboarding/list-dish-catalog";
import { cn } from "@/lib/utils";

type MealFrequency = Database["public"]["Enums"]["meal_frequency"];

/** Frequency tiers in display order — mirrors the `meal_frequency` enum (P10). */
const FREQUENCY_OPTIONS: { value: MealFrequency; label: string }[] = [
  { value: "daily", label: "Daily" },
  { value: "once_a_week", label: "Once a week" },
  { value: "once_in_a_while", label: "Once in a while" },
];

/** How many popularity-ranked quick-pick accompaniment chips to surface. */
const POPULAR_LIMIT = 6;
/** How many search matches to show at once. */
const SEARCH_LIMIT = 8;

/**
 * The per-main config in `build` mode (P10): how often the household wants this
 * dish, and the accompaniments it "goes with". Popular accompaniments surface as
 * quick chips; a typeable search reaches the full diet-compatible catalog. Pure UI
 * — selection state lives in the wizard's draft (`SelfBuiltDish`).
 */
export function BuildDishConfig({
  dishName,
  frequency,
  goesWith,
  accompaniments,
  onFrequencyChange,
  onToggleAccompaniment,
}: {
  dishName: string;
  frequency: MealFrequency;
  goesWith: string[];
  /** Full diet-compatible accompaniment catalog (popularity-ordered). */
  accompaniments: DishCatalogItem[];
  onFrequencyChange: (frequency: MealFrequency) => void;
  onToggleAccompaniment: (name: string) => void;
}) {
  const [search, setSearch] = useState("");

  // Quick picks: the most popular accompaniments that aren't this dish or already
  // chosen. The catalog is already popularity-ordered, so take from the front.
  const popular = useMemo(
    () =>
      accompaniments
        .filter((d) => d.name !== dishName && !goesWith.includes(d.name))
        .slice(0, POPULAR_LIMIT),
    [accompaniments, dishName, goesWith],
  );

  const term = search.trim().toLowerCase();
  const matches = useMemo(() => {
    if (!term) return [];
    return accompaniments
      .filter(
        (d) =>
          d.name !== dishName &&
          !goesWith.includes(d.name) &&
          d.name.toLowerCase().includes(term),
      )
      .slice(0, SEARCH_LIMIT);
  }, [accompaniments, term, dishName, goesWith]);

  return (
    <div className="flex flex-col gap-3 text-sm">
      <div>
        <p className="mb-1.5 text-xs font-medium text-muted-foreground">
          How often?
        </p>
        <div className="flex flex-wrap gap-1.5">
          {FREQUENCY_OPTIONS.map((option) => {
            const active = frequency === option.value;
            return (
              <button
                key={option.value}
                type="button"
                aria-pressed={active}
                onClick={() => onFrequencyChange(option.value)}
                className={cn(
                  "rounded-full border px-2.5 py-1 text-xs transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/25",
                  active
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-background hover:border-primary/40",
                )}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <p className="mb-1.5 text-xs font-medium text-muted-foreground">
          Goes with
        </p>

        {goesWith.length > 0 ? (
          <ul className="mb-2 flex flex-wrap gap-1.5">
            {goesWith.map((name) => (
              <li key={name}>
                <button
                  type="button"
                  onClick={() => onToggleAccompaniment(name)}
                  className="flex items-center gap-1 rounded-full border border-primary bg-primary/15 px-2.5 py-1 text-xs text-primary outline-none focus-visible:ring-3 focus-visible:ring-ring/25"
                  aria-label={`Remove ${name}`}
                >
                  {name}
                  <X className="size-3" />
                </button>
              </li>
            ))}
          </ul>
        ) : null}

        {popular.length > 0 ? (
          <ul className="mb-2 flex flex-wrap gap-1.5">
            {popular.map((dish) => (
              <li key={dish.id}>
                <button
                  type="button"
                  onClick={() => onToggleAccompaniment(dish.name)}
                  className="flex items-center gap-1 rounded-full border border-dashed border-border px-2.5 py-1 text-xs text-muted-foreground transition-colors outline-none hover:border-primary/40 hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/25"
                >
                  <Plus className="size-3" />
                  {dish.name}
                </button>
              </li>
            ))}
          </ul>
        ) : null}

        <Input
          type="search"
          placeholder="Search to add more…"
          aria-label={`Search accompaniments for ${dishName}`}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        {matches.length > 0 ? (
          <ul className="mt-1.5 flex flex-wrap gap-1.5">
            {matches.map((dish) => (
              <li key={dish.id}>
                <button
                  type="button"
                  onClick={() => {
                    onToggleAccompaniment(dish.name);
                    setSearch("");
                  }}
                  className="flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-xs transition-colors outline-none hover:border-primary/40 focus-visible:ring-3 focus-visible:ring-ring/25"
                >
                  <Plus className="size-3" />
                  {dish.name}
                </button>
              </li>
            ))}
          </ul>
        ) : term ? (
          <p className="mt-1.5 text-xs text-muted-foreground">
            No dishes match &ldquo;{search}&rdquo;.
          </p>
        ) : null}
      </div>
    </div>
  );
}
