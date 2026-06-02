import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo, useState } from "react";

import {
  getHousehold,
  groceryApi,
  isApiError,
  newIdempotencyKey,
  type GroceryScreen,
} from "@/api";
import { todayISO } from "@/lib/dates";

/**
 * Grocery orchestration (M1-7, design/10 § 6). Loads the current plan's grocery
 * screen (`{ plan, list }`) for the device-local day and the caller's
 * `can_manage_grocery_list`. Checking an item off flips that one item
 * optimistically and reconciles from the server's returned item (no full-list
 * refetch); regenerate rebuilds the list (idempotent — design/04 § 3).
 */
export function useGrocery(householdId: string) {
  const qc = useQueryClient();
  // Keyed by the device-local day so the screen resolves the same "today" the
  // Today/Week boards do; a `["grocery", householdId]`-prefixed invalidate (from
  // a Today action that changed the list) still matches it.
  const date = todayISO();
  const screenKey = useMemo(
    () => ["grocery", householdId, date] as const,
    [householdId, date],
  );
  const [actionError, setActionError] = useState<string | null>(null);

  const householdQuery = useQuery({
    queryKey: ["household", householdId],
    queryFn: () => getHousehold(householdId),
    staleTime: 5 * 60_000,
  });

  const screenQuery = useQuery({
    queryKey: screenKey,
    queryFn: () => groceryApi.getGroceryScreen(householdId, date),
  });

  // Flip a single line's `checked` in the cached screen, leaving others (and any
  // concurrent in-flight toggle) untouched.
  const setItemChecked = useCallback(
    (itemId: string, checked: boolean) => {
      qc.setQueryData<GroceryScreen>(screenKey, (cur) =>
        cur?.list
          ? {
              ...cur,
              list: {
                ...cur.list,
                items: cur.list.items.map((it) =>
                  it.groceryListItemId === itemId ? { ...it, checked } : it,
                ),
              },
            }
          : cur,
      );
    },
    [qc, screenKey],
  );

  const toggle = useMutation({
    mutationFn: ({ itemId, checked }: { itemId: string; checked: boolean }) =>
      groceryApi.setGroceryItemChecked(itemId, checked),
    // Optimistically flip just this item for an instant feel while shopping, and
    // remember its prior value so a failure rolls back only this line.
    onMutate: async ({ itemId, checked }) => {
      await qc.cancelQueries({ queryKey: screenKey });
      const previousChecked =
        qc
          .getQueryData<GroceryScreen>(screenKey)
          ?.list?.items.find((it) => it.groceryListItemId === itemId)
          ?.checked ?? !checked;
      setItemChecked(itemId, checked);
      return { itemId, previousChecked };
    },
    // Reconcile from the server's authoritative item — no whole-list refetch, so
    // rapid check-offs don't trigger a request-per-tap storm.
    onSuccess: (updated) =>
      setItemChecked(updated.groceryListItemId, updated.checked),
    onError: (err, _vars, context) => {
      if (context) setItemChecked(context.itemId, context.previousChecked);
      setActionError(
        isApiError(err) ? err.message : "Couldn't update that item.",
      );
    },
  });

  const regenerate = useMutation({
    mutationFn: (mealPlanId: string) =>
      groceryApi.regenerateGroceryList(
        householdId,
        mealPlanId,
        newIdempotencyKey(),
      ),
    onSuccess: (list) => {
      qc.setQueryData<GroceryScreen>(screenKey, (cur) =>
        cur ? { ...cur, list } : cur,
      );
    },
    onError: (err) =>
      setActionError(
        isApiError(err) ? err.message : "Couldn't rebuild the list.",
      ),
  });

  const screen = screenQuery.data;

  return {
    plan: screen?.plan ?? null,
    list: screen?.list ?? null,
    isLoading: householdQuery.isLoading || screenQuery.isLoading,
    error: householdQuery.error ?? screenQuery.error,
    canManage:
      householdQuery.data?.currentUserPermissions.canManageGroceryList ?? false,
    regenerating: regenerate.isPending,
    actionError,
    /** True while a pull-to-refresh / background re-read of the list is in flight. */
    refreshing: screenQuery.isRefetching,
    refetch: () => {
      void screenQuery.refetch();
    },
    setChecked: (itemId: string, checked: boolean) => {
      setActionError(null);
      toggle.mutate({ itemId, checked });
    },
    regenerate: (mealPlanId: string) => {
      setActionError(null);
      regenerate.mutate(mealPlanId);
    },
  };
}
