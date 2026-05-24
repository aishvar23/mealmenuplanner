"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { mealSlotLabel } from "@/lib/admin/options";
import { mealItemStatusLabel } from "@/lib/meal-plan/labels";
import type { MealPlanItemDto } from "@/lib/services/meal-plan/dto";

import * as api from "./meal-plan-client";

/**
 * Weekly Plan board (P5-3/P5-4/P5-5/P5-6, design/08 § 3). A "Generate week"
 * action fills every planned `(date, slot)` cell; each cell then supports
 * swapping the dish (suggest-another), marking eating out, and locking. Because
 * the week is server-rendered (the page reads `getWeekPlan`), mutations re-pull
 * via `router.refresh()` rather than threading per-cell state.
 */
export function WeekBoard({
  householdId,
  startDate,
  endDate,
  slots,
  items,
  canChange,
}: {
  householdId: string;
  startDate: string;
  endDate: string;
  slots: string[];
  items: MealPlanItemDto[];
  canChange: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const byCell = new Map(
    items.map((item) => [`${item.date}|${item.mealSlot}`, item]),
  );
  const dates = datesInRange(startDate, endDate);

  function act(fn: () => Promise<unknown>) {
    setError(null);
    startTransition(async () => {
      try {
        await fn();
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong.");
      }
    });
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {formatDate(startDate)} – {formatDate(endDate)}
        </p>
        {canChange && (
          <Button
            disabled={pending}
            onClick={() =>
              act(() => api.generateWeek(householdId, startDate, endDate))
            }
          >
            {pending ? "Working…" : "Generate week"}
          </Button>
        )}
      </div>

      {error && <p className="mt-2 text-sm text-destructive">{error}</p>}

      <div className="mt-4 space-y-4">
        {dates.map((date) => (
          <section key={date} className="rounded-lg border p-4">
            <h3 className="font-heading text-sm font-semibold tracking-tight">
              {formatDate(date)}
            </h3>
            <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {slots.map((slot) => {
                const item = byCell.get(`${date}|${slot}`) ?? null;
                return (
                  <div key={slot} className="rounded-md border bg-muted/20 p-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-muted-foreground">
                        {mealSlotLabel(slot)}
                      </span>
                      {item && (
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          {item.locked && <span title="Locked">🔒</span>}
                          {mealItemStatusLabel(item.status)}
                        </span>
                      )}
                    </div>
                    <p className="mt-1 truncate text-sm">
                      {item?.dishId
                        ? (item.dishName ?? "Selected dish")
                        : item?.status === "eating_out"
                          ? "Eating out"
                          : "—"}
                    </p>
                    {canChange && item && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {item.status !== "eating_out" && (
                          <Button
                            size="xs"
                            variant="outline"
                            disabled={pending}
                            onClick={() =>
                              act(() => api.suggestAnother(item.mealPlanItemId))
                            }
                          >
                            Swap
                          </Button>
                        )}
                        <Button
                          size="xs"
                          variant="ghost"
                          disabled={pending}
                          onClick={() =>
                            act(() => api.markEatingOut(item.mealPlanItemId))
                          }
                        >
                          Eating out
                        </Button>
                        <Button
                          size="xs"
                          variant="ghost"
                          disabled={pending}
                          onClick={() =>
                            act(() =>
                              item.locked
                                ? api.unlockItem(item.mealPlanItemId)
                                : api.lockItem(item.mealPlanItemId),
                            )
                          }
                        >
                          {item.locked ? "Unlock" : "Lock"}
                        </Button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

/** Every `YYYY-MM-DD` from `start` to `end` inclusive (UTC). */
function datesInRange(start: string, end: string): string[] {
  const out: string[] = [];
  const endMs = Date.parse(`${end}T00:00:00Z`);
  let ms = Date.parse(`${start}T00:00:00Z`);
  while (ms <= endMs) {
    out.push(new Date(ms).toISOString().slice(0, 10));
    ms += 86_400_000;
  }
  return out;
}

/** "Mon, May 25" in UTC, stable across server/client render. */
function formatDate(date: string): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}
