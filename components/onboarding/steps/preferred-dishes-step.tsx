"use client";

import { Check, Sparkles, UtensilsCrossed } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { FoodImage } from "@/components/ui/food-image";
import { Input } from "@/components/ui/input";
import type { PreferredDishes } from "@/lib/onboarding";
import type { DishCatalogItem } from "@/lib/services/onboarding/list-dish-catalog";
import { cn } from "@/lib/utils";

/**
 * Step 3 — preferred dishes (BUG-006, PREFDISH-001..005). The household either
 * picks favourite dishes by hand (`manual`) or delegates to the planner
 * (`system`). Manual picks are stored as dish **names** in the draft and become
 * the owner's `liked_dishes` at completion, which the engine rewards with its
 * "+10 dish your household likes" bonus.
 *
 * The catalog is fetched on demand (only when manual mode is chosen) from
 * `GET /api/onboarding/dishes`, narrowed to the household's diet so it never
 * offers an incompatible dish. Only standalone-eligible dishes appear.
 */
export function PreferredDishesStep({
  value,
  onChange,
  diet,
}: {
  value: PreferredDishes;
  onChange: (patch: Partial<PreferredDishes>) => void;
  /** The household's chosen diet (from the previous step), used to filter. */
  diet?: string;
}) {
  const mode = value.mode;
  const selected = value.dishNames ?? [];

  const [catalog, setCatalog] = useState<DishCatalogItem[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [search, setSearch] = useState("");
  // Guards against re-fetching the catalog on every render once it's in flight.
  const startedRef = useRef(false);

  const loadCatalog = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    const url = diet
      ? `/api/onboarding/dishes?diet=${encodeURIComponent(diet)}`
      : "/api/onboarding/dishes";
    try {
      const res = await fetch(url, { headers: { accept: "application/json" } });
      if (!res.ok) throw new Error(String(res.status));
      setCatalog((await res.json()) as DishCatalogItem[]);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [diet]);

  // Lazy-load the catalog the first time manual mode is active (covers both a
  // fresh pick and a resumed draft that was already in manual mode). State is set
  // inside `loadCatalog`, never synchronously in the effect body.
  useEffect(() => {
    if (mode === "manual" && !startedRef.current) {
      startedRef.current = true;
      void loadCatalog();
    }
  }, [mode, loadCatalog]);

  function toggleDish(name: string) {
    const next = selected.includes(name)
      ? selected.filter((n) => n !== name)
      : [...selected, name];
    onChange({ dishNames: next });
  }

  const filtered = (catalog ?? []).filter((dish) =>
    dish.name.toLowerCase().includes(search.trim().toLowerCase()),
  );

  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-3 sm:grid-cols-2">
        <ModeCard
          icon={UtensilsCrossed}
          title="Choose my preferred dishes"
          description="Hand-pick favourites so they show up more often."
          selected={mode === "manual"}
          onSelect={() => onChange({ mode: "manual" })}
        />
        <ModeCard
          icon={Sparkles}
          title="Let the system choose"
          description="The planner picks from your diet, cuisines, and time."
          selected={mode === "system"}
          onSelect={() => onChange({ mode: "system", dishNames: [] })}
        />
      </div>

      {mode === "manual" ? (
        <div className="flex flex-col gap-3">
          <Input
            type="search"
            placeholder="Search dishes…"
            aria-label="Search dishes"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />

          {selected.length > 0 ? (
            <p className="text-xs text-muted-foreground">
              {selected.length} dish{selected.length === 1 ? "" : "es"} selected
            </p>
          ) : null}

          {loading ? (
            <p className="text-sm text-muted-foreground">Loading dishes…</p>
          ) : loadError ? (
            <p role="alert" className="text-sm text-destructive">
              Couldn&apos;t load dishes. You can skip this and let the system
              choose.
            </p>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No dishes match &ldquo;{search}&rdquo;.
            </p>
          ) : (
            <ul className="grid max-h-80 grid-cols-1 gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
              {filtered.map((dish) => {
                const isOn = selected.includes(dish.name);
                return (
                  <li key={dish.id}>
                    <button
                      type="button"
                      aria-pressed={isOn}
                      onClick={() => toggleDish(dish.name)}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-left text-sm transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/25",
                        isOn
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border bg-card hover:border-primary/30 hover:bg-primary/5",
                      )}
                    >
                      <FoodImage
                        kind="dish"
                        src={dish.imageUrl}
                        status={dish.imageStatus}
                        altText={dish.imageAltText ?? dish.name}
                        className="size-11 shrink-0"
                        sizes="2.75rem"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-semibold">
                          {dish.name}
                        </span>
                        {dish.cuisine ? (
                          <span className="block truncate text-xs text-muted-foreground">
                            {dish.cuisine}
                          </span>
                        ) : null}
                      </span>
                      {isOn ? <Check className="size-4 shrink-0" /> : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ) : mode === "system" ? (
        <p className="rounded-lg border border-border bg-muted/30 px-3 py-3 text-sm text-muted-foreground">
          Great — the planner will choose dishes from your diet, cuisines,
          cooking time, and variety rules. You can add favourites any time
          later.
        </p>
      ) : (
        <p className="text-sm text-muted-foreground">
          Pick one of the options above. Either way you can change favourites
          later.
        </p>
      )}
    </div>
  );
}

function ModeCard({
  icon: Icon,
  title,
  description,
  selected,
  onSelect,
}: {
  icon: typeof Sparkles;
  title: string;
  description: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      className={cn(
        "flex flex-col gap-2 rounded-lg border p-4 text-left transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/25",
        selected
          ? "border-primary bg-primary/10"
          : "border-border bg-card hover:border-primary/30 hover:bg-primary/5",
      )}
    >
      <span
        className={cn(
          "flex size-9 items-center justify-center rounded-lg",
          selected
            ? "bg-primary text-primary-foreground"
            : "bg-muted text-muted-foreground",
        )}
      >
        <Icon className="size-5" />
      </span>
      <span className="font-heading text-base font-bold">{title}</span>
      <span className="text-sm leading-5 text-muted-foreground">
        {description}
      </span>
    </button>
  );
}
