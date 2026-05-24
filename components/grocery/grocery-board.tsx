"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { categoryLabel, formatQuantity } from "@/lib/grocery/labels";
import type {
  GroceryItemDto,
  GroceryListDto,
} from "@/lib/services/grocery/dto";

import * as api from "./grocery-client";

/**
 * Grocery list screen (P7-2/P7-3, design/08 § 9). Renders the plan's list grouped
 * by category (the server returns items already category-ordered), each line
 * checkable; a `can_manage_grocery_list` member can regenerate it from the
 * current plan. Item check-off and regeneration both update local state from the
 * action responses, so no page refetch is needed.
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

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {list
            ? `${list.items.length} item${list.items.length === 1 ? "" : "s"}`
            : "No grocery list yet."}
        </p>
        {canManage && (
          <Button
            size="sm"
            variant={list ? "outline" : "default"}
            disabled={pending}
            onClick={onRegenerate}
          >
            {pending
              ? "Working…"
              : list
                ? "Regenerate"
                : "Generate grocery list"}
          </Button>
        )}
      </div>

      {error && <p className="mt-2 text-sm text-destructive">{error}</p>}

      {!list ? (
        <div className="mt-6 rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
          {canManage
            ? "Generate a grocery list from your current plan to get started."
            : "No grocery list has been generated for this plan yet."}
        </div>
      ) : list.items.length === 0 ? (
        <div className="mt-6 rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
          Nothing to buy — no dishes with ingredients are planned for this plan.
        </div>
      ) : (
        <div className="mt-6 space-y-6">
          {groupByCategory(list.items).map((group) => (
            <section key={group.category}>
              <h2 className="font-heading text-sm font-semibold tracking-tight text-muted-foreground">
                {categoryLabel(group.category)}
              </h2>
              <ul className="mt-2 divide-y rounded-lg border">
                {group.items.map((item) => (
                  <li
                    key={item.groceryListItemId}
                    className="flex items-center gap-3 px-3 py-2"
                  >
                    <input
                      type="checkbox"
                      className="size-4 accent-primary"
                      checked={item.checked}
                      disabled={pending || !canManage}
                      onChange={() => onToggle(item)}
                      aria-label={`Mark ${item.name} as bought`}
                    />
                    <span
                      className={
                        item.checked
                          ? "flex-1 text-sm text-muted-foreground line-through"
                          : "flex-1 text-sm"
                      }
                    >
                      {item.name}
                    </span>
                    <span className="text-sm text-muted-foreground tabular-nums">
                      {formatQuantity(item.quantity, item.unit)}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

interface CategoryGroup {
  category: string;
  items: GroceryItemDto[];
}

/** Group the (already category-ordered) items into consecutive category runs. */
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
