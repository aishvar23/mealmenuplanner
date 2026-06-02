import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import {
  getHousehold,
  groceryApi,
  isApiError,
  newIdempotencyKey,
  type GroceryScreen,
} from "@/api";

/**
 * Grocery orchestration (M1-7, design/10 § 6). Loads the current plan's grocery
 * screen (`{ plan, list }`) and the caller's `can_manage_grocery_list`. Checking
 * an item off updates optimistically and reconciles with the server response;
 * regenerate rebuilds the list (idempotent — design/04 § 3).
 */
export function useGrocery(householdId: string) {
  const qc = useQueryClient();
  const screenKey = ["grocery", householdId] as const;
  const [actionError, setActionError] = useState<string | null>(null);

  const householdQuery = useQuery({
    queryKey: ["household", householdId],
    queryFn: () => getHousehold(householdId),
    staleTime: 5 * 60_000,
  });

  const screenQuery = useQuery({
    queryKey: screenKey,
    queryFn: () => groceryApi.getGroceryScreen(householdId),
  });

  const toggle = useMutation({
    mutationFn: ({ itemId, checked }: { itemId: string; checked: boolean }) =>
      groceryApi.setGroceryItemChecked(itemId, checked),
    // Optimistically flip the checkbox for an instant feel while shopping.
    onMutate: async ({ itemId, checked }) => {
      await qc.cancelQueries({ queryKey: screenKey });
      const previous = qc.getQueryData<GroceryScreen>(screenKey);
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
      return { previous };
    },
    onError: (err, _vars, context) => {
      if (context?.previous) qc.setQueryData(screenKey, context.previous);
      setActionError(
        isApiError(err) ? err.message : "Couldn't update that item.",
      );
    },
    onSettled: () => qc.invalidateQueries({ queryKey: screenKey }),
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
