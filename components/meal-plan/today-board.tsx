"use client";

import {
  CheckCircle2,
  Lock,
  LockOpen,
  RefreshCw,
  Sparkles,
  Utensils,
  XCircle,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { FoodImage } from "@/components/ui/food-image";
import { mealSlotLabel } from "@/lib/admin/options";
import {
  mealItemStatusLabel,
  packagePairingSuffix,
  REJECT_FEEDBACK_OPTIONS,
} from "@/lib/meal-plan/labels";
import type {
  AlternativeDto,
  MealPlanItemDto,
} from "@/lib/services/meal-plan/dto";
import { cn } from "@/lib/utils";

import * as api from "./meal-plan-client";

/**
 * Whether a slot still needs the user's attention — no item yet, an empty
 * non-eating-out slot, or a suggestion awaiting approval. Mirrors the slots that
 * surface a primary "Suggest"/"Approve" CTA in {@link ActionRow}.
 */
function needsDecision(item: MealPlanItemDto | null): boolean {
  if (!item) return true;
  if (!item.dishId && item.status !== "eating_out") return true;
  return item.status === "suggested";
}

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
  // Feature the slot that most needs a decision (the first undecided one) so the
  // hero's "Best next decision" label is honest; fall back to the first slot
  // when everything is already settled.
  const featuredSlot =
    slots.find((slot) => needsDecision(seeded.get(slot) ?? null)) ?? slots[0];
  if (!featuredSlot) return null;
  const supportingSlots = slots.filter((slot) => slot !== featuredSlot);

  return (
    <div className="grid gap-5 2xl:grid-cols-[minmax(0,1.35fr)_minmax(20rem,0.65fr)]">
      <SlotCard
        householdId={householdId}
        date={date}
        slot={featuredSlot}
        initialItem={seeded.get(featuredSlot) ?? null}
        canChange={canChange}
        featured
      />

      <div className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-1">
        {supportingSlots.map((slot) => (
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
    </div>
  );
}

function SlotCard({
  householdId,
  date,
  slot,
  initialItem,
  canChange,
  featured = false,
}: {
  householdId: string;
  date: string;
  slot: string;
  initialItem: MealPlanItemDto | null;
  canChange: boolean;
  featured?: boolean;
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
        toast.success(`${mealSlotLabel(slot)} approved`);
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
        toast.success("Meal swapped");
      },
    );

  const onEatingOut = (id: string) =>
    run(
      () => api.markEatingOut(id),
      (updated) => {
        setItem(updated);
        setAlternatives([]);
        toast.success(`${mealSlotLabel(slot)} set to eating out`);
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

  const hasDish = Boolean(item?.dishId);
  const isEatingOut = item?.status === "eating_out";
  // The "+ Steamed Rice" package line, when the chosen main has accompaniments.
  const pairingSuffix =
    hasDish && item ? packagePairingSuffix(item.pairedDishes) : null;

  return (
    <section
      className={cn(
        "overflow-hidden rounded-lg border bg-card text-card-foreground shadow-xs",
        featured && "min-h-[28rem]",
      )}
    >
      {featured ? (
        <div className="relative min-h-48 border-b">
          <FoodImage
            kind="dish"
            src={item?.dishImageUrl}
            status={item?.dishImageStatus}
            altText={item?.dishImageAltText ?? item?.dishName}
            className="absolute inset-0 aspect-auto rounded-none"
            imageClassName="object-cover object-[34%_50%]"
            sizes="(min-width: 1280px) 55vw, 100vw"
          />
          <div className="absolute inset-0 bg-[linear-gradient(90deg,oklch(0.14_0.035_145/0.78),oklch(0.14_0.035_145/0.3)_62%,transparent)]" />
          <div className="relative flex min-h-48 flex-col justify-end p-5 text-white">
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-white/80">
              <Sparkles className="size-4" />
              Best next decision
            </div>
            <h2 className="font-heading text-3xl font-bold tracking-tight">
              {hasDish
                ? (item?.dishName ?? "Selected dish")
                : isEatingOut
                  ? "Eating out"
                  : `Plan ${mealSlotLabel(slot).toLowerCase()}`}
            </h2>
            {pairingSuffix ? (
              <p className="mt-1 text-base font-semibold text-white/90">
                {pairingSuffix}
              </p>
            ) : null}
            <p className="mt-2 max-w-xl text-sm leading-6 text-white/80">
              {hasDish
                ? (item?.reason ??
                  "This suggestion fits your household preferences.")
                : isEatingOut
                  ? "No cooking needed for this meal slot."
                  : "Generate one practical suggestion, then approve it or try another."}
            </p>
          </div>
        </div>
      ) : null}

      <div className="flex min-h-56 flex-col gap-4 p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-bold tracking-[0.16em] text-muted-foreground uppercase">
              {mealSlotLabel(slot)}
            </p>
            {!featured ? (
              <div className="mt-2 flex items-center gap-3">
                <FoodImage
                  kind="dish"
                  src={item?.dishImageUrl}
                  status={item?.dishImageStatus}
                  altText={item?.dishImageAltText ?? item?.dishName}
                  className="size-14 shrink-0"
                  sizes="3.5rem"
                />
                <div>
                  <h3 className="font-heading text-xl font-bold tracking-tight">
                    {hasDish
                      ? (item?.dishName ?? "Selected dish")
                      : isEatingOut
                        ? "Eating out"
                        : "Ready for a suggestion"}
                  </h3>
                  {pairingSuffix ? (
                    <p className="mt-1 text-sm font-semibold text-primary">
                      {pairingSuffix}
                    </p>
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>
          {item ? (
            <span className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-2.5 py-1 text-xs font-bold text-accent-foreground">
              {item.locked ? <Lock className="size-3.5" /> : null}
              {mealItemStatusLabel(item.status)}
            </span>
          ) : null}
        </div>

        {!featured ? (
          <p className="text-sm leading-6 text-muted-foreground">
            {hasDish
              ? (item?.reason ??
                "This suggestion fits your household preferences.")
              : isEatingOut
                ? "No dish planned for this slot."
                : "No suggestion yet. Start with one tap."}
          </p>
        ) : null}

        {error ? (
          <p className="rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        ) : null}

        <div className="mt-auto flex flex-col gap-3">
          {canChange ? (
            <ActionRow
              item={item}
              pending={pending}
              onGenerate={onGenerate}
              onAccept={onAccept}
              onSuggestAnother={onSuggestAnother}
              onEatingOut={onEatingOut}
              onToggleLock={onToggleLock}
              onToggleReject={() => setRejecting((v) => !v)}
            />
          ) : null}

          {rejecting && item ? (
            <div className="rounded-lg border bg-muted/40 p-3">
              <p className="mb-2 text-xs font-semibold text-muted-foreground">
                What should the planner learn?
              </p>
              <div className="flex flex-wrap gap-2">
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
          ) : null}

          {alternatives.length > 0 && item ? (
            <div className="rounded-lg border bg-background p-3">
              <p className="mb-2 text-xs font-semibold text-muted-foreground">
                Quick swaps
              </p>
              <ul className="flex flex-col gap-2">
                {alternatives.map((alt) => (
                  <li
                    key={alt.dishId}
                    className="flex items-center justify-between gap-2"
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <FoodImage
                        kind="dish"
                        src={alt.dishImageUrl}
                        status={alt.dishImageStatus}
                        altText={alt.dishImageAltText ?? alt.dishName}
                        className="size-10 shrink-0"
                        sizes="2.5rem"
                      />
                      <span className="truncate text-sm font-medium">
                        {alt.dishName ?? "Dish"}
                        {packagePairingSuffix(alt.pairedDishes) ? (
                          <span className="ml-1 font-normal text-muted-foreground">
                            {packagePairingSuffix(alt.pairedDishes)}
                          </span>
                        ) : null}
                      </span>
                    </span>
                    {canChange ? (
                      <Button
                        size="xs"
                        variant="outline"
                        disabled={pending}
                        onClick={() =>
                          onReplace(item.mealPlanItemId, alt.dishId)
                        }
                      >
                        Choose
                      </Button>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function ActionRow({
  item,
  pending,
  onGenerate,
  onAccept,
  onSuggestAnother,
  onEatingOut,
  onToggleLock,
  onToggleReject,
}: {
  item: MealPlanItemDto | null;
  pending: boolean;
  onGenerate: () => void;
  onAccept: (id: string) => void;
  onSuggestAnother: (id: string) => void;
  onEatingOut: (id: string) => void;
  onToggleLock: (item: MealPlanItemDto) => void;
  onToggleReject: () => void;
}) {
  if (!item || (!item.dishId && item.status !== "eating_out")) {
    return (
      <Button disabled={pending} onClick={onGenerate}>
        <Sparkles data-icon="inline-start" />
        {pending ? "Working..." : "Suggest a meal"}
      </Button>
    );
  }

  if (item.status === "eating_out") {
    return (
      <Button variant="outline" disabled={pending} onClick={onGenerate}>
        <Utensils data-icon="inline-start" />
        Plan a meal instead
      </Button>
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      {item.status === "suggested" ? (
        <Button
          className="flex-1 sm:flex-none"
          disabled={pending}
          onClick={() => onAccept(item.mealPlanItemId)}
        >
          <CheckCircle2 data-icon="inline-start" />
          Approve
        </Button>
      ) : null}
      <Button
        variant="outline"
        disabled={pending}
        onClick={() => onSuggestAnother(item.mealPlanItemId)}
      >
        <RefreshCw data-icon="inline-start" />
        Try another
      </Button>
      <Button
        variant="ghost"
        disabled={pending}
        onClick={() => onEatingOut(item.mealPlanItemId)}
      >
        <Utensils data-icon="inline-start" />
        Eating out
      </Button>
      <Button
        variant="ghost"
        size="icon"
        disabled={pending}
        onClick={() => onToggleLock(item)}
        aria-label={item.locked ? "Unlock meal" : "Lock meal"}
        title={item.locked ? "Unlock meal" : "Lock meal"}
      >
        {item.locked ? <Lock /> : <LockOpen />}
      </Button>
      <Button
        variant="ghost"
        size="icon"
        disabled={pending}
        onClick={onToggleReject}
        aria-label="Reject with feedback"
        title="Reject with feedback"
      >
        <XCircle />
      </Button>
    </div>
  );
}
