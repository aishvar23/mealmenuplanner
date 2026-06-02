import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo, useState } from "react";

import {
  getHousehold,
  isApiError,
  mealPlanApi,
  newIdempotencyKey,
  type FeedbackType,
  type MealPlanItem,
  type MealSlot,
} from "@/api";
import { todayISO } from "@/lib/dates";

/**
 * Today-board orchestration (M1-3/4/5). Loads the household (for the configured
 * slots + the caller's `can_change_today_menu`) and the day plan, and exposes the
 * per-item actions. Every mutation re-reads the authoritative day plan on settle
 * (last-write-wins, design/08), so the board never drifts from the server.
 *
 * `busyItemId` tracks the one item currently mutating so its card shows a spinner
 * and disables; `generating` covers the day-level "generate missing slots".
 */

const SLOT_ORDER: MealSlot[] = ["breakfast", "lunch", "dinner", "snack"];

export function useTodayBoard(householdId: string) {
  const date = todayISO();
  const qc = useQueryClient();
  const dayKey = useMemo(
    () => ["dayPlan", householdId, date] as const,
    [householdId, date],
  );

  const [busyItemId, setBusyItemId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const householdQuery = useQuery({
    queryKey: ["household", householdId],
    queryFn: () => getHousehold(householdId),
    staleTime: 5 * 60_000,
  });

  const dayQuery = useQuery({
    queryKey: dayKey,
    queryFn: () => mealPlanApi.getDayPlan(householdId, date),
  });

  // A change to today's plan can also change the grocery list (replace/eating-out
  // trigger a recalc server-side) and what the Week view shows, so refresh those
  // alongside the day plan rather than letting them drift until staleTime.
  const invalidatePlanViews = useCallback(
    () =>
      Promise.all([
        qc.invalidateQueries({ queryKey: dayKey }),
        qc.invalidateQueries({ queryKey: ["grocery", householdId] }),
        qc.invalidateQueries({ queryKey: ["weekPlan", householdId] }),
      ]),
    [qc, dayKey, householdId],
  );

  const items = dayQuery.data?.items;
  const canChange =
    householdQuery.data?.currentUserPermissions.canChangeTodayMenu ?? false;

  // Configured slots (household preference) that have no item yet, in slot order.
  const configured = householdQuery.data?.preferences?.mealsToPlan ?? [];
  const plannedSlots = new Set((items ?? []).map((i) => i.mealSlot));
  const missingSlots = SLOT_ORDER.filter(
    (slot) => configured.includes(slot) && !plannedSlots.has(slot),
  );

  /** Run a single-item action, flag the item busy, then re-read the affected views. */
  const runItem = useCallback(
    async (id: string, fn: () => Promise<unknown>) => {
      setActionError(null);
      setBusyItemId(id);
      try {
        await fn();
        await invalidatePlanViews();
        // The slot's eligible swap candidates may have changed (the dish moved,
        // variety/rotation shifted), so drop them — the next SwapSheet re-reads.
        void qc.invalidateQueries({ queryKey: ["candidates", id] });
      } catch (e) {
        setActionError(errorMessage(e));
      } finally {
        setBusyItemId(null);
      }
    },
    [invalidatePlanViews, qc],
  );

  const generate = useMutation({
    mutationFn: async (slots: MealSlot[]) => {
      // Generate each missing slot independently (distinct idempotency keys, no
      // ordering dependency) so one slot failing doesn't abort the rest.
      const results = await Promise.allSettled(
        slots.map((slot) =>
          mealPlanApi.generateToday(
            householdId,
            date,
            slot,
            newIdempotencyKey(),
          ),
        ),
      );
      const failure = results.find((r) => r.status === "rejected");
      if (failure) throw (failure as PromiseRejectedResult).reason;
    },
    // Re-read regardless of outcome: on a partial failure the slots that DID
    // generate must still appear (not stay hidden until a manual refresh).
    onSettled: () => invalidatePlanViews(),
    onError: (e) => setActionError(errorMessage(e)),
  });

  return {
    date,
    items,
    isLoading: householdQuery.isLoading || dayQuery.isLoading,
    error: householdQuery.error ?? dayQuery.error,
    canChange,
    missingSlots,
    hasAnyPlanned: (items?.length ?? 0) > 0,
    generating: generate.isPending,
    busyItemId,
    actionError,
    clearActionError: () => setActionError(null),
    /** True while a pull-to-refresh re-read of the day plan is in flight. */
    refreshing: dayQuery.isRefetching,
    refetch: () => {
      // Pull-to-refresh re-reads the plan; the household (perms/prefs) is
      // 5-min-stale and rarely changes, so don't re-fetch it on every pull.
      void dayQuery.refetch();
    },
    generateMissing: () => generate.mutate(missingSlots),
    accept: (id: string) => runItem(id, () => mealPlanApi.acceptItem(id)),
    reject: (id: string, feedbackType: FeedbackType, reason: string | null) =>
      runItem(id, () => mealPlanApi.rejectItem(id, { feedbackType, reason })),
    replace: (id: string, dishId: string) =>
      runItem(id, () =>
        mealPlanApi.replaceItem(id, { replacementDishId: dishId }),
      ),
    suggestAnother: (id: string) =>
      runItem(id, () => mealPlanApi.suggestAnother(id)),
    toggleLock: (item: MealPlanItem) =>
      runItem(item.mealPlanItemId, () =>
        item.locked
          ? mealPlanApi.unlockItem(item.mealPlanItemId)
          : mealPlanApi.lockItem(item.mealPlanItemId),
      ),
    eatingOut: (id: string) => runItem(id, () => mealPlanApi.markEatingOut(id)),
    cooked: (id: string) => runItem(id, () => mealPlanApi.markCooked(id)),
  };
}

function errorMessage(e: unknown): string {
  if (isApiError(e)) return e.message;
  return "Something went wrong. Please try again.";
}
