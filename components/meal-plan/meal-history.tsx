"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { mealSlotLabel } from "@/lib/admin/options";
import { mealItemStatusLabel } from "@/lib/meal-plan/labels";
import type { MealPlanItemDto } from "@/lib/services/meal-plan/dto";

import * as api from "./meal-plan-client";

/**
 * Meal history (P5-7, design/08 § 8). `meal_plan_items` is the history — this is
 * the user-facing view of the same record the recommender reads for variety.
 * Past planned meals that weren't yet resolved can be marked cooked, which is the
 * terminal outcome that counts toward rotation.
 */
export function MealHistory({
  initialItems,
  canChange,
}: {
  initialItems: MealPlanItemDto[];
  canChange: boolean;
}) {
  const [items, setItems] = useState(initialItems);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (items.length === 0) {
    return (
      <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
        No past meals yet. Once you plan and cook, your history shows here.
      </p>
    );
  }

  async function onMarkCooked(id: string) {
    setPendingId(id);
    setError(null);
    try {
      const updated = await api.markCooked(id);
      setItems((prev) =>
        prev.map((item) => (item.mealPlanItemId === id ? updated : item)),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setPendingId(null);
    }
  }

  return (
    <div>
      {error && <p className="mb-2 text-sm text-destructive">{error}</p>}
      <ul className="divide-y rounded-lg border">
        {items.map((item) => {
          const cookable =
            canChange &&
            item.dishId !== null &&
            (item.status === "accepted" || item.status === "suggested");
          return (
            <li
              key={item.mealPlanItemId}
              className="flex items-center justify-between gap-3 px-4 py-3"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">
                  {item.dishId
                    ? (item.dishName ?? "Selected dish")
                    : "Eating out"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {item.date} · {mealSlotLabel(item.mealSlot)} ·{" "}
                  {mealItemStatusLabel(item.status)}
                </p>
              </div>
              {cookable && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={pendingId === item.mealPlanItemId}
                  onClick={() => onMarkCooked(item.mealPlanItemId)}
                >
                  Mark cooked
                </Button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
