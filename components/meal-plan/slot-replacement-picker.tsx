"use client";

import { Check, Clock, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { MealFilterChips } from "@/components/meal-plan/meal-filter-chips";
import { Button } from "@/components/ui/button";
import { FoodImage } from "@/components/ui/food-image";
import { packagePairingSuffix } from "@/lib/meal-plan/labels";
import {
  dishMatchesFilter,
  type MealFilter,
} from "@/lib/meal-plan/meal-filter";
import type {
  AlternativeDto,
  ReplaceResult,
} from "@/lib/services/meal-plan/dto";
import { cn } from "@/lib/utils";

import * as api from "./meal-plan-client";

/**
 * Single-select "choose a dish for this slot" picker (BUG-022/023). Replaces the
 * old auto-cycling "Swap"/"Try another", which just took whatever the engine
 * picked next. It lists every slot-eligible dish (`GET .../candidates`, consistent
 * with the recommender's hard filters), lets the user pick exactly **one**, and
 * commits it through the existing `replaceItem` endpoint — so the same component
 * serves the weekly board and the Today board. Cancelling is non-destructive
 * (SLOTPICK-006): nothing is written until "Replace meal" is confirmed.
 */
export function SlotReplacementPicker({
  itemId,
  slotLabel,
  currentDishName,
  onCancel,
  onReplaced,
}: {
  itemId: string;
  slotLabel: string;
  currentDishName?: string | null;
  onCancel: () => void;
  onReplaced: (result: ReplaceResult) => void;
}) {
  const [candidates, setCandidates] = useState<AlternativeDto[] | null>(null);
  const [filter, setFilter] = useState<MealFilter>("all");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedDishId, setSelectedDishId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    api
      .slotCandidates(itemId)
      .then((res) => {
        if (active) setCandidates(res.candidates);
      })
      .catch((e) => {
        if (active) {
          setLoadError(
            e instanceof Error
              ? e.message
              : "Couldn't load dishes for this slot.",
          );
        }
      });
    return () => {
      active = false;
    };
  }, [itemId]);

  // Escape cancels — matches the backdrop click, no native dialog involved.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape" && !submitting) onCancel();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel, submitting]);

  async function confirm() {
    if (!selectedDishId || !selectedVisible) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const result = await api.replaceItem(itemId, {
        replacementDishId: selectedDishId,
      });
      onReplaced(result);
    } catch (e) {
      setSubmitError(
        e instanceof Error ? e.message : "Couldn't replace this meal.",
      );
      setSubmitting(false);
    }
  }

  const visible = useMemo(
    () =>
      (candidates ?? []).filter((candidate) =>
        dishMatchesFilter(candidate, filter),
      ),
    [candidates, filter],
  );

  // Treat the selection as active only while the chosen dish is actually shown.
  // The goal chip can hide it (its card unmounts), and committing a dish the
  // user can no longer see would be a surprise — so gate confirm + the button on
  // visibility rather than on the raw id, which we keep so flipping back to a
  // chip that re-reveals the dish restores the highlight.
  const selectedVisible =
    selectedDishId !== null &&
    visible.some((candidate) => candidate.dishId === selectedDishId);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={() => {
        if (!submitting) onCancel();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Choose a dish for ${slotLabel}`}
        className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-lg border bg-card text-card-foreground shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b p-4">
          <div>
            <h2 className="font-heading text-lg font-bold tracking-tight">
              Choose a dish for {slotLabel}
            </h2>
            {currentDishName ? (
              <p className="text-sm text-muted-foreground">
                Replacing {currentDishName}
              </p>
            ) : null}
          </div>
          <Button
            variant="ghost"
            size="icon"
            disabled={submitting}
            onClick={onCancel}
            aria-label="Cancel"
          >
            <X />
          </Button>
        </div>

        <div className="border-b px-4 py-3">
          <MealFilterChips value={filter} onChange={setFilter} />
        </div>

        <div className="min-h-40 flex-1 overflow-y-auto p-4">
          {loadError ? (
            <p role="alert" className="text-sm text-destructive">
              {loadError}
            </p>
          ) : candidates === null ? (
            <p className="text-sm text-muted-foreground">Loading dishes…</p>
          ) : candidates.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No other eligible dishes for this slot right now.
            </p>
          ) : visible.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No dishes match this filter.
            </p>
          ) : (
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {visible.map((candidate) => {
                const selected = candidate.dishId === selectedDishId;
                const suffix = packagePairingSuffix(candidate.pairedDishes);
                return (
                  <li key={candidate.dishId}>
                    <button
                      type="button"
                      aria-pressed={selected}
                      disabled={submitting}
                      onClick={() => setSelectedDishId(candidate.dishId)}
                      className={cn(
                        "flex w-full flex-col overflow-hidden rounded-lg border text-left transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/25",
                        selected
                          ? "border-primary ring-2 ring-primary/40"
                          : "border-border hover:border-primary/40",
                      )}
                    >
                      <div className="relative">
                        <FoodImage
                          kind="dish"
                          src={candidate.dishImageUrl}
                          status={candidate.dishImageStatus}
                          altText={
                            candidate.dishImageAltText ?? candidate.dishName
                          }
                          className="aspect-[4/3] w-full"
                          imageClassName="object-cover"
                          sizes="(min-width: 640px) 12rem, 45vw"
                        />
                        {selected ? (
                          <span className="absolute top-1.5 right-1.5 flex size-6 items-center justify-center rounded-full bg-primary text-primary-foreground">
                            <Check className="size-4" />
                          </span>
                        ) : null}
                      </div>
                      <div className="flex flex-col gap-0.5 p-2">
                        <span className="text-sm font-semibold">
                          {candidate.dishName ?? "Dish"}
                        </span>
                        {suffix ? (
                          <span className="text-xs text-muted-foreground">
                            {suffix}
                          </span>
                        ) : null}
                        {candidate.prepTasks.length > 0 ? (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700">
                            <Clock className="size-3" />
                            Needs advance prep
                          </span>
                        ) : null}
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 border-t p-4">
          {submitError ? (
            <p className="text-sm text-destructive">{submitError}</p>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button variant="ghost" disabled={submitting} onClick={onCancel}>
              Cancel
            </Button>
            <Button disabled={!selectedVisible || submitting} onClick={confirm}>
              {submitting ? "Replacing…" : "Replace meal"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
