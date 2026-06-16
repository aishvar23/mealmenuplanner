import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type {
  CatalogItemDto,
  CreateMenuDayInput,
  EditMenuDayInput,
  MenuDayDto,
} from "@mmp/shared/provider";

import { providerClient } from "./client";

/**
 * Owner menu manager hook (MP-C-030, the mobile twin of the web menu page, spec §13.3).
 * Reads this week's menu days + the owner's catalog through the shared
 * `ProviderApiClient` seam, and exposes the owner writes as mutations that invalidate the
 * week list — authoring a draft day (`create`), publishing a complete one (`publish`), and
 * STRUCTURALLY editing an existing day (`revise`, ADR-7 = REVISION). Each reuses the merged
 * writers (PR #57/#58/#59). Customization authoring + member suggestions are the remainder
 * of #22.
 */

export function weeklyMenuQueryKey(providerId: string) {
  return ["provider-weekly-menu", providerId] as const;
}

export function menuCatalogQueryKey(providerId: string) {
  return ["provider-menu-catalog", providerId] as const;
}

export function useMenuManager(providerId: string) {
  const queryClient = useQueryClient();

  const weeklyMenu = useQuery<MenuDayDto[]>({
    queryKey: weeklyMenuQueryKey(providerId),
    queryFn: () => providerClient.getWeeklyMenu(providerId),
  });

  const catalog = useQuery<CatalogItemDto[]>({
    queryKey: menuCatalogQueryKey(providerId),
    queryFn: () => providerClient.listCatalog(providerId),
  });

  const invalidateWeek = () =>
    queryClient.invalidateQueries({
      queryKey: weeklyMenuQueryKey(providerId),
    });

  const create = useMutation({
    mutationFn: (input: CreateMenuDayInput) =>
      providerClient.createMenuDay(providerId, input),
    onSuccess: invalidateWeek,
  });

  const publish = useMutation({
    mutationFn: (menuDayId: string) => providerClient.publishMenuDay(menuDayId),
    onSuccess: invalidateWeek,
  });

  const revise = useMutation({
    mutationFn: ({
      menuDayId,
      input,
    }: {
      menuDayId: string;
      input: EditMenuDayInput;
    }) => providerClient.reviseMenuDay(menuDayId, input),
    onSuccess: invalidateWeek,
  });

  return { weeklyMenu, catalog, create, publish, revise };
}
