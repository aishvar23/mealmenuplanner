"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import {
  DIET_TYPE_OPTIONS,
  DISH_STATUS_OPTIONS,
  MEAL_SLOT_OPTIONS,
} from "@/lib/admin/options";

/**
 * Dish-list search + filter bar (P3-2). Each control writes its value into the
 * URL query string; the server `dishes` page re-reads the params and re-runs
 * `listDishes`, so filtering is plain SSR with shareable/bookmarkable URLs.
 */
export function DishListControls() {
  const router = useRouter();
  const params = useSearchParams();
  const [search, setSearch] = useState(params.get("search") ?? "");

  function navigate(next: URLSearchParams) {
    const qs = next.toString();
    router.push(qs ? `/admin/dishes?${qs}` : "/admin/dishes");
  }

  function setParam(key: string, value: string) {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    navigate(next);
  }

  function submitSearch(event: React.FormEvent) {
    event.preventDefault();
    setParam("search", search.trim());
  }

  function reset() {
    setSearch("");
    navigate(new URLSearchParams());
  }

  return (
    <div className="flex flex-wrap items-end gap-3 rounded-lg border bg-muted/30 p-3">
      <form onSubmit={submitSearch} className="flex items-end gap-2">
        <div className="grid gap-1">
          <Label htmlFor="dish-search">Search name</Label>
          <Input
            id="dish-search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="e.g. paneer"
            className="w-48"
          />
        </div>
        <Button type="submit" variant="outline" size="lg">
          Search
        </Button>
      </form>

      <FilterSelect
        id="filter-status"
        label="Status"
        value={params.get("status") ?? ""}
        onChange={(value) => setParam("status", value)}
        options={DISH_STATUS_OPTIONS}
      />
      <FilterSelect
        id="filter-diet"
        label="Diet"
        value={params.get("dietType") ?? ""}
        onChange={(value) => setParam("dietType", value)}
        options={DIET_TYPE_OPTIONS}
      />
      <FilterSelect
        id="filter-slot"
        label="Meal slot"
        value={params.get("mealSlot") ?? ""}
        onChange={(value) => setParam("mealSlot", value)}
        options={MEAL_SLOT_OPTIONS}
      />

      <label className="flex items-center gap-2 self-end pb-2 text-sm">
        <input
          type="checkbox"
          checked={params.get("missingMetadata") === "true"}
          onChange={(event) =>
            setParam("missingMetadata", event.target.checked ? "true" : "")
          }
        />
        Missing metadata
      </label>

      <Button type="button" variant="ghost" size="lg" onClick={reset}>
        Reset
      </Button>
    </div>
  );
}

function FilterSelect({
  id,
  label,
  value,
  onChange,
  options,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: readonly { value: string; label: string }[];
}) {
  return (
    <div className="grid gap-1">
      <Label htmlFor={id}>{label}</Label>
      <Select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-40"
      >
        <option value="">All</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </Select>
    </div>
  );
}
