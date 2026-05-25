"use client";

import { Check, RotateCcw, ShoppingBasket } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { categoryLabel, formatQuantity } from "@/lib/grocery/labels";
import type {
  GroceryItemDto,
  GroceryListDto,
} from "@/lib/services/grocery/dto";
import { cn } from "@/lib/utils";

import * as api from "./grocery-client";

type GroceryFilter = "all" | "remaining" | "bought";

/**
 * Grocery list screen (P7-2/P7-3, design/08 section 9). Renders the plan's list
 * grouped by category, each line checkable; a can_manage_grocery_list member can
 * regenerate it from the current plan.
 */
export function GroceryBoard({
  householdId,
  mealPlanId,
  initialList,
  canManage,
}: {
  householdId: string;
  mealPlanId: string;
  initialList: GroceryListDto | null;
  canManage: boolean;
}) {
  const [list, setList] = useState<GroceryListDto | null>(initialList);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<GroceryFilter>("remaining");

  async function run<T>(
    fn: () => Promise<T>,
    apply: (result: T) => void,
  ): Promise<void> {
    setPending(true);
    setError(null);
    try {
      apply(await fn());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setPending(false);
    }
  }

  const onRegenerate = () =>
    run(
      () => api.regenerateGroceryList(householdId, mealPlanId),
      (updated) => setList(updated),
    );

  const onToggle = (item: GroceryItemDto) =>
    run(
      () => api.setItemChecked(item.groceryListItemId, !item.checked),
      (updated) =>
        setList((prev) =>
          prev
            ? {
                ...prev,
                items: prev.items.map((i) =>
                  i.groceryListItemId === updated.groceryListItemId
                    ? updated
                    : i,
                ),
              }
            : prev,
        ),
    );

  const total = list?.items.length ?? 0;
  const bought = list?.items.filter((item) => item.checked).length ?? 0;
  const remaining = total - bought;
  const progress = total > 0 ? Math.round((bought / total) * 100) : 0;
  const visibleItems =
    list?.items.filter((item) => {
      if (filter === "remaining") return !item.checked;
      if (filter === "bought") return item.checked;
      return true;
    }) ?? [];

  return (
    <div className="flex flex-col gap-5">
      <section className="rounded-lg border bg-card p-5 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="flex size-12 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <ShoppingBasket className="size-6" />
            </span>
            <div>
              <p className="font-heading text-xl font-bold tracking-tight">
                {list ? `${remaining} left to buy` : "No grocery list yet"}
              </p>
              <p className="text-sm text-muted-foreground">
                {list
                  ? `${bought} bought of ${total} items`
                  : "Generate from the current plan"}
              </p>
            </div>
          </div>
          {canManage ? (
            <Button
              variant={list ? "outline" : "default"}
              disabled={pending}
              onClick={onRegenerate}
            >
              <RotateCcw data-icon="inline-start" />
              {pending
                ? "Working..."
                : list
                  ? "Regenerate"
                  : "Generate grocery list"}
            </Button>
          ) : null}
        </div>

        {list ? (
          <div className="mt-4">
            <div
              className="h-2 overflow-hidden rounded-full bg-muted"
              role="progressbar"
              aria-valuenow={progress}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Grocery progress"
            >
              <div
                className="h-full rounded-full bg-primary transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        ) : null}

        {error ? (
          <p className="mt-3 rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        ) : null}
      </section>

      {!list ? (
        <EmptyGroceryState canManage={canManage} />
      ) : list.items.length === 0 ? (
        <div className="rounded-lg border border-dashed bg-card p-10 text-center text-sm text-muted-foreground shadow-xs">
          Nothing to buy. No dishes with ingredients are planned for this plan.
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <FilterTabs value={filter} onChange={setFilter} />
          {visibleItems.length === 0 ? (
            <div className="rounded-lg border border-dashed bg-card p-8 text-center text-sm text-muted-foreground shadow-xs">
              {filter === "remaining"
                ? "Everything is checked off."
                : "No bought items yet."}
            </div>
          ) : (
            groupByCategory(visibleItems).map((group) => (
              <section
                key={group.category}
                className="rounded-lg border bg-card shadow-xs"
              >
                <div className="flex items-center justify-between border-b px-4 py-3">
                  <h2 className="font-heading text-sm font-bold tracking-tight">
                    {categoryLabel(group.category)}
                  </h2>
                  <span className="text-xs font-semibold text-muted-foreground">
                    {group.items.length}
                  </span>
                </div>
                <ul className="divide-y">
                  {group.items.map((item) => (
                    <li key={item.groceryListItemId}>
                      <label
                        className={cn(
                          "flex min-h-14 cursor-pointer items-center gap-3 px-4 py-3 transition-colors hover:bg-primary/5",
                          item.checked && "bg-muted/40",
                        )}
                      >
                        <input
                          type="checkbox"
                          className="peer sr-only"
                          checked={item.checked}
                          disabled={pending || !canManage}
                          onChange={() => onToggle(item)}
                          aria-label={`Mark ${item.name} as bought`}
                        />
                        <span
                          className={cn(
                            "flex size-6 items-center justify-center rounded-lg border text-primary transition-colors peer-focus-visible:border-ring peer-focus-visible:ring-3 peer-focus-visible:ring-ring/30",
                            item.checked
                              ? "border-primary bg-primary text-primary-foreground"
                              : "border-input bg-background",
                          )}
                        >
                          {item.checked ? <Check className="size-4" /> : null}
                        </span>
                        <span
                          className={cn(
                            "min-w-0 flex-1 text-sm font-semibold",
                            item.checked &&
                              "text-muted-foreground line-through",
                          )}
                        >
                          {item.name}
                        </span>
                        <span className="text-sm font-semibold text-muted-foreground tabular-nums">
                          {formatQuantity(item.quantity, item.unit)}
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              </section>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function FilterTabs({
  value,
  onChange,
}: {
  value: GroceryFilter;
  onChange: (value: GroceryFilter) => void;
}) {
  const options: { value: GroceryFilter; label: string }[] = [
    { value: "remaining", label: "Remaining" },
    { value: "all", label: "All" },
    { value: "bought", label: "Bought" },
  ];

  return (
    <div className="flex w-full max-w-md rounded-lg border bg-card p-1 shadow-xs">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          className={cn(
            "flex-1 rounded-md px-3 py-2 text-sm font-bold transition-colors",
            value === option.value
              ? "bg-primary text-primary-foreground shadow-xs"
              : "text-muted-foreground hover:bg-primary/5 hover:text-primary",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function EmptyGroceryState({ canManage }: { canManage: boolean }) {
  return (
    <div className="rounded-lg border border-dashed bg-card p-10 text-center text-sm text-muted-foreground shadow-xs">
      {canManage
        ? "Generate a grocery list from your current plan to get started."
        : "No grocery list has been generated for this plan yet."}
    </div>
  );
}

interface CategoryGroup {
  category: string;
  items: GroceryItemDto[];
}

/** Group the already category-ordered items into consecutive category runs. */
function groupByCategory(items: GroceryItemDto[]): CategoryGroup[] {
  const groups: CategoryGroup[] = [];
  for (const item of items) {
    const last = groups[groups.length - 1];
    if (last && last.category === item.category) {
      last.items.push(item);
    } else {
      groups.push({ category: item.category, items: [item] });
    }
  }
  return groups;
}
