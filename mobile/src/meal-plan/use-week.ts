import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  getHousehold,
  isApiError,
  mealPlanApi,
  newIdempotencyKey,
  type MealPlanItem,
} from "@/api";
import { defaultWeekRange } from "@/lib/dates";

/**
 * Week-plan orchestration (M1-6, design/10 § 6). Reads the next 7 days and, for a
 * caller with `can_change_weekly_schedule`, generates the week (idempotent —
 * design/04 § 3). Per-meal edits stay on the Today board; the Week tab is the
 * at-a-glance view plus the one-shot generate.
 *
 * Items come back ordered by date then slot; the screen groups them by day.
 */
export function useWeekBoard(householdId: string) {
  const { startDate, endDate } = defaultWeekRange();
  const qc = useQueryClient();
  const weekKey = ["weekPlan", householdId, startDate, endDate] as const;

  const householdQuery = useQuery({
    queryKey: ["household", householdId],
    queryFn: () => getHousehold(householdId),
    staleTime: 5 * 60_000,
  });

  const weekQuery = useQuery({
    queryKey: weekKey,
    queryFn: () => mealPlanApi.getWeekPlan(householdId, startDate, endDate),
  });

  const generate = useMutation({
    mutationFn: () =>
      mealPlanApi.generateWeek(
        householdId,
        startDate,
        endDate,
        newIdempotencyKey(),
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: weekKey }),
  });

  const items: MealPlanItem[] = weekQuery.data?.items ?? [];

  return {
    startDate,
    endDate,
    items,
    isLoading: householdQuery.isLoading || weekQuery.isLoading,
    error: householdQuery.error ?? weekQuery.error,
    canChange:
      householdQuery.data?.currentUserPermissions.canChangeWeeklySchedule ??
      false,
    hasAnyPlanned: items.length > 0,
    generating: generate.isPending,
    generateError: generate.error
      ? isApiError(generate.error)
        ? generate.error.message
        : "Couldn't generate the week. Please try again."
      : null,
    refetch: () => {
      void householdQuery.refetch();
      void weekQuery.refetch();
    },
    generateWeek: () => generate.mutate(),
  };
}
