"use client";

import { LayoutGrid, Sparkles, UtensilsCrossed } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { BuildDishConfig } from "@/components/onboarding/cards/build-dish-config";
import { CombinationCard } from "@/components/onboarding/cards/combination-card";
import { DishCard } from "@/components/onboarding/cards/dish-card";
import { ModeCard } from "@/components/onboarding/mode-card";
import { Input } from "@/components/ui/input";
import type { Database } from "@/lib/db/database.types";
import type { PreferredDishes, SelfBuiltDish } from "@/lib/onboarding";
import type { CombinationCatalogItem } from "@/lib/services/onboarding/list-combination-catalog";
import type { DishCatalogItem } from "@/lib/services/onboarding/list-dish-catalog";

type MealFrequency = Database["public"]["Enums"]["meal_frequency"];

/**
 * Step 3 — preferred dishes (BUG-006 + P10). The household chooses how to seed its
 * meal preferences via three card-based modes:
 *   • `combinations` — pick admin-curated meal combinations (popularity-ranked).
 *   • `build` — pick main dishes, each tagged with a frequency tier + the
 *     accompaniments it "goes with".
 *   • `system` — delegate to the recommendation engine.
 * A legacy `manual` mode (favourite dish names) still renders for resumed/edit
 * drafts seeded that way. Each catalog is fetched on demand the first time its
 * mode is opened, narrowed to the household's diet so nothing incompatible shows.
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
  const dietQuery = diet ? `?diet=${encodeURIComponent(diet)}` : "";

  const combinations = useLazyCatalog<CombinationCatalogItem>(
    mode === "combinations",
    `/api/onboarding/combinations${dietQuery}`,
  );
  const mains = useLazyCatalog<DishCatalogItem>(
    mode === "build" || mode === "manual",
    `/api/onboarding/dishes${dietQuery}`,
  );
  const accompaniments = useLazyCatalog<DishCatalogItem>(
    mode === "build",
    `/api/onboarding/accompaniments${dietQuery}`,
  );

  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-3 sm:grid-cols-3">
        <ModeCard
          icon={LayoutGrid}
          title="Select meal combinations"
          description="Pick ready-made plates like dal, sabzi, roti and rice."
          selected={mode === "combinations"}
          onSelect={() =>
            onChange({ mode: "combinations", dishNames: [], builtDishes: [] })
          }
        />
        <ModeCard
          icon={UtensilsCrossed}
          title="Build your own combination"
          description="Choose dishes and how often you'd like each one."
          selected={mode === "build"}
          onSelect={() =>
            onChange({
              mode: "build",
              dishNames: [],
              selectedCombinationIds: [],
            })
          }
        />
        <ModeCard
          icon={Sparkles}
          title="Let the system decide"
          description="The planner picks from your diet, cuisines, and time."
          selected={mode === "system"}
          onSelect={() =>
            onChange({
              mode: "system",
              dishNames: [],
              selectedCombinationIds: [],
              builtDishes: [],
            })
          }
        />
      </div>

      {mode === "combinations" ? (
        <CombinationsMode
          value={value}
          onChange={onChange}
          catalog={combinations}
        />
      ) : mode === "build" ? (
        <BuildMode
          value={value}
          onChange={onChange}
          mains={mains}
          accompaniments={accompaniments.data ?? []}
        />
      ) : mode === "manual" ? (
        <ManualMode value={value} onChange={onChange} mains={mains} />
      ) : mode === "system" ? (
        <p className="rounded-lg border border-border bg-muted/30 px-3 py-3 text-sm text-muted-foreground">
          Great — the planner will choose dishes from your diet, cuisines,
          cooking time, and variety rules. You can add favourites any time
          later.
        </p>
      ) : (
        <p className="text-sm text-muted-foreground">
          Pick one of the options above. Either way you can change your choices
          later.
        </p>
      )}
    </div>
  );
}

// ──────────────────────────── combinations mode ────────────────────────────

function CombinationsMode({
  value,
  onChange,
  catalog,
}: {
  value: PreferredDishes;
  onChange: (patch: Partial<PreferredDishes>) => void;
  catalog: LazyCatalog<CombinationCatalogItem>;
}) {
  const [search, setSearch] = useState("");
  const selected = value.selectedCombinationIds ?? [];

  function toggle(id: string) {
    const next = selected.includes(id)
      ? selected.filter((s) => s !== id)
      : [...selected, id];
    onChange({ selectedCombinationIds: next });
  }

  const filtered = (catalog.data ?? []).filter((combo) =>
    combo.name.toLowerCase().includes(search.trim().toLowerCase()),
  );

  return (
    <div className="flex flex-col gap-3">
      <Input
        type="search"
        placeholder="Search combinations…"
        aria-label="Search meal combinations"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
      />
      {selected.length > 0 ? (
        <p className="text-xs text-muted-foreground">
          {selected.length} combination{selected.length === 1 ? "" : "s"}{" "}
          selected
        </p>
      ) : null}

      <CatalogState
        catalog={catalog}
        empty={filtered.length === 0}
        emptyLabel={`No combinations match “${search}”.`}
        loadingLabel="Loading combinations…"
      >
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {filtered.map((combo) => (
            <li key={combo.id}>
              <CombinationCard
                combination={combo}
                selected={selected.includes(combo.id)}
                onToggle={() => toggle(combo.id)}
              />
            </li>
          ))}
        </ul>
      </CatalogState>
    </div>
  );
}

// ──────────────────────────────── build mode ────────────────────────────────

function BuildMode({
  value,
  onChange,
  mains,
  accompaniments,
}: {
  value: PreferredDishes;
  onChange: (patch: Partial<PreferredDishes>) => void;
  mains: LazyCatalog<DishCatalogItem>;
  accompaniments: DishCatalogItem[];
}) {
  const [search, setSearch] = useState("");
  const built = useMemo(() => value.builtDishes ?? [], [value.builtDishes]);
  const builtByName = useMemo(
    () => new Map(built.map((b) => [b.dishName, b])),
    [built],
  );

  function setBuilt(next: SelfBuiltDish[]) {
    onChange({ builtDishes: next });
  }

  function toggleMain(name: string) {
    setBuilt(
      builtByName.has(name)
        ? built.filter((b) => b.dishName !== name)
        : [
            ...built,
            { dishName: name, frequency: "once_in_a_while", goesWith: [] },
          ],
    );
  }

  function setFrequency(name: string, frequency: MealFrequency) {
    setBuilt(built.map((b) => (b.dishName === name ? { ...b, frequency } : b)));
  }

  function toggleAccompaniment(name: string, accName: string) {
    setBuilt(
      built.map((b) => {
        if (b.dishName !== name) return b;
        const goesWith = b.goesWith.includes(accName)
          ? b.goesWith.filter((g) => g !== accName)
          : [...b.goesWith, accName];
        return { ...b, goesWith };
      }),
    );
  }

  const filtered = (mains.data ?? []).filter((dish) =>
    dish.name.toLowerCase().includes(search.trim().toLowerCase()),
  );

  return (
    <div className="flex flex-col gap-3">
      <Input
        type="search"
        placeholder="Search dishes…"
        aria-label="Search dishes"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
      />
      {built.length > 0 ? (
        <p className="text-xs text-muted-foreground">
          {built.length} dish{built.length === 1 ? "" : "es"} added
        </p>
      ) : null}

      <CatalogState
        catalog={mains}
        empty={filtered.length === 0}
        emptyLabel={`No dishes match “${search}”.`}
        loadingLabel="Loading dishes…"
      >
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {filtered.map((dish) => {
            const config = builtByName.get(dish.name);
            return (
              <li key={dish.id}>
                <DishCard
                  name={dish.name}
                  cuisine={dish.cuisine}
                  imageUrl={dish.imageUrl}
                  imageAltText={dish.imageAltText}
                  imageStatus={dish.imageStatus}
                  selected={Boolean(config)}
                  onToggle={() => toggleMain(dish.name)}
                  footer={
                    config ? (
                      <BuildDishConfig
                        dishName={dish.name}
                        frequency={config.frequency}
                        goesWith={config.goesWith}
                        accompaniments={accompaniments}
                        onFrequencyChange={(frequency) =>
                          setFrequency(dish.name, frequency)
                        }
                        onToggleAccompaniment={(accName) =>
                          toggleAccompaniment(dish.name, accName)
                        }
                      />
                    ) : null
                  }
                />
              </li>
            );
          })}
        </ul>
      </CatalogState>
    </div>
  );
}

// ──────────────────────────── manual mode (legacy) ────────────────────────────

function ManualMode({
  value,
  onChange,
  mains,
}: {
  value: PreferredDishes;
  onChange: (patch: Partial<PreferredDishes>) => void;
  mains: LazyCatalog<DishCatalogItem>;
}) {
  const [search, setSearch] = useState("");
  const selected = value.dishNames ?? [];

  function toggle(name: string) {
    const next = selected.includes(name)
      ? selected.filter((n) => n !== name)
      : [...selected, name];
    onChange({ dishNames: next });
  }

  const filtered = (mains.data ?? []).filter((dish) =>
    dish.name.toLowerCase().includes(search.trim().toLowerCase()),
  );

  return (
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
      <CatalogState
        catalog={mains}
        empty={filtered.length === 0}
        emptyLabel={`No dishes match “${search}”.`}
        loadingLabel="Loading dishes…"
      >
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {filtered.map((dish) => (
            <li key={dish.id}>
              <DishCard
                name={dish.name}
                cuisine={dish.cuisine}
                imageUrl={dish.imageUrl}
                imageAltText={dish.imageAltText}
                imageStatus={dish.imageStatus}
                selected={selected.includes(dish.name)}
                onToggle={() => toggle(dish.name)}
              />
            </li>
          ))}
        </ul>
      </CatalogState>
    </div>
  );
}

// ──────────────────────────────── shared bits ────────────────────────────────

interface LazyCatalog<T> {
  data: T[] | null;
  loading: boolean;
  error: boolean;
}

/** Fetch a JSON list once, the first time `active` becomes true. */
function useLazyCatalog<T>(active: boolean, url: string): LazyCatalog<T> {
  const [data, setData] = useState<T[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const started = useRef(false);

  useEffect(() => {
    if (!active || started.current) return;
    started.current = true;
    setLoading(true);
    setError(false);
    fetch(url, { headers: { accept: "application/json" } })
      .then((res) => {
        if (!res.ok) throw new Error(String(res.status));
        return res.json();
      })
      .then((json) => setData(json as T[]))
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [active, url]);

  return { data, loading, error };
}

/** Loading / error / empty states shared by the three grids. */
function CatalogState<T>({
  catalog,
  empty,
  emptyLabel,
  loadingLabel,
  children,
}: {
  catalog: LazyCatalog<T>;
  empty: boolean;
  emptyLabel: string;
  loadingLabel: string;
  children: React.ReactNode;
}) {
  if (catalog.loading) {
    return <p className="text-sm text-muted-foreground">{loadingLabel}</p>;
  }
  if (catalog.error) {
    return (
      <p role="alert" className="text-sm text-destructive">
        Couldn&apos;t load these. You can skip this and let the system choose.
      </p>
    );
  }
  if (empty) {
    return <p className="text-sm text-muted-foreground">{emptyLabel}</p>;
  }
  return <div className="max-h-[28rem] overflow-y-auto pr-1">{children}</div>;
}
