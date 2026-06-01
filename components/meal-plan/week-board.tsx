"use client";

import {
  CalendarRange,
  Lock,
  LockOpen,
  RefreshCw,
  Sparkles,
  Utensils,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { FoodImage } from "@/components/ui/food-image";
import { Input } from "@/components/ui/input";
import { mealSlotLabel } from "@/lib/admin/options";
import {
  mealItemStatusLabel,
  packagePairingSuffix,
} from "@/lib/meal-plan/labels";
import type { MealPlanItemDto } from "@/lib/services/meal-plan/dto";
import { cn } from "@/lib/utils";

import * as api from "./meal-plan-client";
import { SlotReplacementPicker } from "./slot-replacement-picker";

/**
 * Weekly Plan board (P5-3/P5-4/P5-5/P5-6, design/08 section 3). A
 * "Generate week" action fills every planned (date, slot) cell; each cell then
 * supports swapping the dish, marking eating out, and locking.
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
  // The cell whose replacement picker is open, if any (BUG-022).
  const [pickerItem, setPickerItem] = useState<MealPlanItemDto | null>(null);

  const byCell = new Map(
    items.map((item) => [`${item.date}|${item.mealSlot}`, item]),
  );
  const dates = datesInRange(startDate, endDate);
  const plannedCount = items.filter((item) => item.dishId).length;
  const totalSlots = dates.length * slots.length;

  function act(fn: () => Promise<unknown>, successMessage?: string) {
    setError(null);
    startTransition(async () => {
      try {
        await fn();
        router.refresh();
        if (successMessage) toast.success(successMessage);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong.");
      }
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-xl border bg-card p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex size-11 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <CalendarRange className="size-5" />
            </span>
            <div>
              <p className="font-heading text-lg font-bold tracking-tight">
                {formatDate(startDate)} to {formatDate(endDate)}
              </p>
              <p className="text-sm text-muted-foreground">
                {plannedCount} of {totalSlots} meal slots planned
              </p>
            </div>
          </div>
          {canChange ? (
            <Button
              disabled={pending}
              onClick={() =>
                act(
                  () => api.generateWeek(householdId, startDate, endDate),
                  "Week planned",
                )
              }
            >
              <Sparkles data-icon="inline-start" />
              {pending ? "Working..." : "Generate week"}
            </Button>
          ) : null}
        </div>

        {error ? (
          <p className="mt-3 rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        ) : null}
      </div>

      {/*
        Below xl the week is a horizontal, snap-scrolling strip (swipe through
        days, one column ~16rem) so it never crushes on phones/tablets; at xl+
        it reflows into a static 4- then 7-column grid where the whole week is
        visible at a glance. Flex sizing (w-64/shrink-0) is ignored in grid mode.
      */}
      <div className="flex snap-x snap-mandatory gap-3 overflow-x-auto pb-2 xl:grid xl:grid-cols-4 xl:overflow-visible xl:pb-0 2xl:grid-cols-7">
        {dates.map((date, dateIndex) => (
          <section
            key={date}
            className={cn(
              "w-64 shrink-0 snap-start rounded-xl border bg-card p-4 shadow-sm xl:w-auto",
              dateIndex === 0 && "border-primary/40 bg-primary/5",
            )}
          >
            <div className="mb-3">
              <p className="text-xs font-bold tracking-[0.16em] text-muted-foreground uppercase">
                {formatWeekday(date)}
              </p>
              <h3 className="font-heading text-lg font-bold">
                {formatMonthDay(date)}
              </h3>
            </div>

            <div className="flex flex-col gap-2">
              {slots.map((slot) => {
                const item = byCell.get(`${date}|${slot}`) ?? null;
                return (
                  <MealCell
                    key={slot}
                    item={item}
                    slot={slot}
                    pending={pending}
                    canChange={canChange}
                    onChangeMeal={() =>
                      item ? setPickerItem(item) : undefined
                    }
                    onEatingOut={() =>
                      item
                        ? act(() => api.markEatingOut(item.mealPlanItemId))
                        : undefined
                    }
                    onSaveNote={(note) =>
                      item
                        ? act(() =>
                            api.markEatingOut(item.mealPlanItemId, note),
                          )
                        : undefined
                    }
                    onToggleLock={() =>
                      item
                        ? act(() =>
                            item.locked
                              ? api.unlockItem(item.mealPlanItemId)
                              : api.lockItem(item.mealPlanItemId),
                          )
                        : undefined
                    }
                  />
                );
              })}
            </div>
          </section>
        ))}
      </div>

      {pickerItem ? (
        <SlotReplacementPicker
          itemId={pickerItem.mealPlanItemId}
          slotLabel={`${formatWeekday(pickerItem.date)} ${mealSlotLabel(
            pickerItem.mealSlot,
          ).toLowerCase()}`}
          currentDishName={pickerItem.dishName}
          onCancel={() => setPickerItem(null)}
          onReplaced={() => {
            setPickerItem(null);
            router.refresh();
          }}
        />
      ) : null}
    </div>
  );
}

function MealCell({
  item,
  slot,
  pending,
  canChange,
  onChangeMeal,
  onEatingOut,
  onSaveNote,
  onToggleLock,
}: {
  item: MealPlanItemDto | null;
  slot: string;
  pending: boolean;
  canChange: boolean;
  onChangeMeal: () => void | undefined;
  onEatingOut: () => void | undefined;
  onSaveNote: (note: string) => void | undefined;
  onToggleLock: () => void | undefined;
}) {
  const hasDish = Boolean(item?.dishId);
  const pairingSuffix =
    hasDish && item ? packagePairingSuffix(item.pairedDishes) : null;

  return (
    <div
      className={cn(
        "min-h-28 rounded-lg border bg-background p-3",
        hasDish && "border-primary/20 bg-primary/10",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-bold text-muted-foreground">
          {mealSlotLabel(slot)}
        </span>
        {item ? (
          <span className="inline-flex items-center gap-1 rounded-md bg-accent px-1.5 py-0.5 text-[0.65rem] font-bold text-accent-foreground">
            {item.locked ? <Lock className="size-3" /> : null}
            {mealItemStatusLabel(item.status)}
          </span>
        ) : null}
      </div>

      <p
        className={cn(
          "mt-2 min-h-10 text-sm leading-5 font-semibold",
          !hasDish && "text-muted-foreground",
        )}
      >
        <span className="flex items-center gap-2">
          <FoodImage
            kind="dish"
            src={item?.dishImageUrl}
            status={item?.dishImageStatus}
            altText={item?.dishImageAltText ?? item?.dishName}
            className="size-12 shrink-0"
            sizes="3rem"
          />
          <span>
            {hasDish
              ? (item?.dishName ?? "Selected dish")
              : item?.status === "eating_out"
                ? "Eating out"
                : "Open"}
            {pairingSuffix ? (
              <span className="mt-0.5 block text-xs font-medium text-muted-foreground">
                {pairingSuffix}
              </span>
            ) : null}
          </span>
        </span>
      </p>

      {item?.status === "eating_out" &&
      item.eatingOutNote &&
      (!canChange || item.locked) ? (
        <p className="mt-1 text-xs text-muted-foreground">
          <span className="font-semibold text-foreground">Where:</span>{" "}
          {item.eatingOutNote}
        </p>
      ) : null}

      {canChange && item ? (
        item.locked ? (
          // Locked = frozen until unlocked (design/08 §7; the server rejects
          // change / eating-out on a locked cell). Show only the Unlock path so
          // unlocking is the clear way back to editing (BUG-028).
          <div className="mt-3 flex flex-wrap gap-1.5">
            <Button
              size="xs"
              variant="outline"
              disabled={pending}
              onClick={onToggleLock}
            >
              <LockOpen data-icon="inline-start" />
              Unlock to edit
            </Button>
          </div>
        ) : item.status === "eating_out" ? (
          // An eating-out cell holds no dish, but the user must still be able to
          // switch it back to a cooked meal (BUG-029). The weekly board offered no
          // way to — only "mark eating out" again — so the slot was stuck. "Plan a
          // meal" opens the same picker; choosing a dish replaces the eating-out
          // cell with it (mirrors the Today board's "Plan a meal instead"). The
          // place note (BETA) is editable inline above the actions.
          <div className="mt-3 flex flex-col gap-2">
            <WeekEatingOutNote
              note={item.eatingOutNote}
              disabled={pending}
              onSave={onSaveNote}
            />
            <div className="flex flex-wrap gap-1.5">
              <Button
                size="xs"
                variant="outline"
                disabled={pending}
                onClick={onChangeMeal}
              >
                <Utensils data-icon="inline-start" />
                Plan a meal
              </Button>
              <Button
                size="icon-xs"
                variant="ghost"
                disabled={pending}
                onClick={onToggleLock}
                aria-label="Lock meal"
                title="Lock meal"
              >
                <LockOpen />
              </Button>
            </div>
          </div>
        ) : (
          <div className="mt-3 flex flex-wrap gap-1.5">
            <Button
              size="xs"
              variant="outline"
              disabled={pending}
              onClick={onChangeMeal}
            >
              <RefreshCw data-icon="inline-start" />
              Change
            </Button>
            <Button
              size="icon-xs"
              variant="ghost"
              disabled={pending}
              onClick={onEatingOut}
              aria-label="Mark eating out"
              title="Eating out"
            >
              <Utensils />
            </Button>
            <Button
              size="icon-xs"
              variant="ghost"
              disabled={pending}
              onClick={onToggleLock}
              aria-label="Lock meal"
              title="Lock meal"
            >
              <LockOpen />
            </Button>
          </div>
        )
      ) : null}
    </div>
  );
}

/**
 * Compact inline place note for an eating-out cell (BETA). Saved on Enter or the
 * Save button (shown only when the draft differs from the saved note); an empty
 * save clears the note. After saving the board refreshes, re-seeding the input.
 */
function WeekEatingOutNote({
  note,
  disabled,
  onSave,
}: {
  note: string | null;
  disabled: boolean;
  onSave: (note: string) => void;
}) {
  const [draft, setDraft] = useState(note ?? "");
  const [lastNote, setLastNote] = useState(note ?? "");
  if ((note ?? "") !== lastNote) {
    setLastNote(note ?? "");
    setDraft(note ?? "");
  }

  const dirty = draft.trim() !== (note ?? "");
  return (
    <div className="flex items-center gap-1.5">
      <Input
        value={draft}
        disabled={disabled}
        maxLength={200}
        placeholder="Add a place (optional)"
        aria-label="Eating-out place"
        className="h-8 text-xs"
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && dirty) {
            event.preventDefault();
            onSave(draft);
          }
        }}
        onBlur={() => {
          if (dirty) onSave(draft);
        }}
      />
      {dirty ? (
        <Button
          size="xs"
          variant="outline"
          disabled={disabled}
          onClick={() => onSave(draft)}
        >
          Save
        </Button>
      ) : null}
    </div>
  );
}

/** Every YYYY-MM-DD from start to end inclusive (UTC). */
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

function formatDate(date: string): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

function formatWeekday(date: string): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString("en-US", {
    weekday: "short",
    timeZone: "UTC",
  });
}

function formatMonthDay(date: string): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}
