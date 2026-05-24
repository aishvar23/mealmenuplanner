"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { mealSlotLabel } from "@/lib/admin/options";
import {
  mealItemStatusLabel,
  REJECT_FEEDBACK_OPTIONS,
} from "@/lib/meal-plan/labels";
import type {
  AlternativeDto,
  MealPlanItemDto,
} from "@/lib/services/meal-plan/dto";

import * as api from "./meal-plan-client";

/**
 * Today screen board (P5-1/P5-2/P5-5/P5-6, design/08 § 2). One card per planned
 * slot: generate a suggestion, see its recommendation reason, then accept,
 * suggest another, reject (with a reason → recorded feedback), replace with an
 * alternative, mark eating out, or lock. Each card owns its state and updates it
 * from the action responses (the endpoints return the new item + alternatives),
 * so no page refetch is needed.
 */
export function TodayBoard({
  householdId,
  date,
  slots,
  initialItems,
  canChange,
}: {
  householdId: string;
  date: string;
  slots: string[];
  initialItems: MealPlanItemDto[];
  canChange: boolean;
}) {
  const seeded = new Map<string, MealPlanItemDto>(
    initialItems.map((item) => [item.mealSlot, item]),
  );

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {slots.map((slot) => (
        <SlotCard
          key={slot}
          householdId={householdId}
          date={date}
          slot={slot}
          initialItem={seeded.get(slot) ?? null}
          canChange={canChange}
        />
      ))}
    </div>
  );
}

function SlotCard({
  householdId,
  date,
  slot,
  initialItem,
  canChange,
}: {
  householdId: string;
  date: string;
  slot: string;
  initialItem: MealPlanItemDto | null;
  canChange: boolean;
}) {
  const [item, setItem] = useState<MealPlanItemDto | null>(initialItem);
  const [alternatives, setAlternatives] = useState<AlternativeDto[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState(false);

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

  const onGenerate = () =>
    run(
      () => api.generateToday(householdId, date, slot),
      (r) => {
        setItem(r.mealPlanItem);
        setAlternatives(r.alternatives);
      },
    );

  const onSuggestAnother = (id: string) =>
    run(
      () => api.suggestAnother(id),
      (r) => {
        setItem(r.mealPlanItem);
        setAlternatives(r.alternatives);
      },
    );

  const onAccept = (id: string) =>
    run(
      () => api.acceptItem(id),
      (updated) => {
        setItem(updated);
        setAlternatives([]);
      },
    );

  const onReject = (id: string, feedbackType: string) =>
    run(
      () => api.rejectItem(id, { feedbackType }),
      (r) => {
        setItem(r.mealPlanItem);
        setAlternatives(r.alternatives);
        setRejecting(false);
      },
    );

  const onReplace = (id: string, replacementDishId: string) =>
    run(
      () => api.replaceItem(id, { replacementDishId }),
      (r) => {
        setItem(r.mealPlanItem);
        setAlternatives([]);
      },
    );

  const onEatingOut = (id: string) =>
    run(
      () => api.markEatingOut(id),
      (updated) => {
        setItem(updated);
        setAlternatives([]);
      },
    );

  const onToggleLock = (current: MealPlanItemDto) =>
    run(
      () =>
        current.locked
          ? api.unlockItem(current.mealPlanItemId)
          : api.lockItem(current.mealPlanItemId),
      (updated) => setItem(updated),
    );

  return (
    <section className="flex flex-col rounded-lg border p-4">
      <div className="flex items-center justify-between">
        <h3 className="font-heading text-sm font-semibold tracking-tight">
          {mealSlotLabel(slot)}
        </h3>
        {item && (
          <span className="flex items-center gap-2 text-xs text-muted-foreground">
            {item.locked && <span title="Locked">🔒</span>}
            {mealItemStatusLabel(item.status)}
          </span>
        )}
      </div>

      <div className="mt-3 flex-1">
        {item?.dishId ? (
          <>
            <p className="font-medium">{item.dishName ?? "Selected dish"}</p>
            {item.reason && (
              <p className="mt-1 text-sm text-muted-foreground">
                {item.reason}
              </p>
            )}
          </>
        ) : item?.status === "eating_out" ? (
          <p className="text-sm text-muted-foreground">
            Eating out — no dish planned.
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">No suggestion yet.</p>
        )}
      </div>

      {error && <p className="mt-2 text-sm text-destructive">{error}</p>}

      {canChange && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {!item || (!item.dishId && item.status !== "eating_out") ? (
            <Button size="sm" disabled={pending} onClick={onGenerate}>
              {pending ? "Working…" : "Suggest a meal"}
            </Button>
          ) : item.status === "eating_out" ? (
            <Button
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={onGenerate}
            >
              Plan a meal instead
            </Button>
          ) : (
            <>
              {item.status === "suggested" && (
                <Button
                  size="sm"
                  disabled={pending}
                  onClick={() => onAccept(item.mealPlanItemId)}
                >
                  Accept
                </Button>
              )}
              <Button
                size="sm"
                variant="outline"
                disabled={pending}
                onClick={() => onSuggestAnother(item.mealPlanItemId)}
              >
                Suggest another
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={pending}
                onClick={() => setRejecting((v) => !v)}
              >
                Reject
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={pending}
                onClick={() => onEatingOut(item.mealPlanItemId)}
              >
                Eating out
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={pending}
                onClick={() => onToggleLock(item)}
              >
                {item.locked ? "Unlock" : "Lock"}
              </Button>
            </>
          )}
        </div>
      )}

      {rejecting && item && (
        <div className="mt-3 rounded-md border bg-muted/30 p-2">
          <p className="mb-1.5 text-xs text-muted-foreground">
            Why not this dish?
          </p>
          <div className="flex flex-wrap gap-1.5">
            {REJECT_FEEDBACK_OPTIONS.map((option) => (
              <Button
                key={option.value}
                size="xs"
                variant="outline"
                disabled={pending}
                onClick={() => onReject(item.mealPlanItemId, option.value)}
              >
                {option.label}
              </Button>
            ))}
          </div>
        </div>
      )}

      {alternatives.length > 0 && item && (
        <div className="mt-3 border-t pt-3">
          <p className="mb-1.5 text-xs text-muted-foreground">Other options</p>
          <ul className="space-y-1.5">
            {alternatives.map((alt) => (
              <li
                key={alt.dishId}
                className="flex items-center justify-between gap-2"
              >
                <span className="truncate text-sm">
                  {alt.dishName ?? "Dish"}
                </span>
                {canChange && (
                  <Button
                    size="xs"
                    variant="outline"
                    disabled={pending}
                    onClick={() => onReplace(item.mealPlanItemId, alt.dishId)}
                  >
                    Choose
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
