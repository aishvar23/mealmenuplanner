import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type {
  CatalogItemDto,
  CreateCatalogItemRequest,
  UpdateCatalogItemRequest,
} from "@mmp/shared/provider";

import { providerClient } from "./client";

/**
 * Owner catalog management hooks (ADO #88, the mobile twin of the web Catalog page).
 * Reads the owner's dish library through the shared `ProviderApiClient` seam and runs
 * add / edit / archive as mutations that invalidate the list, so a single owner action
 * refreshes the screen. TanStack Query dedupes the key. Reuses the existing catalog
 * backend (MP-A-110) — no new routes.
 */

export function catalogQueryKey(providerId: string) {
  return ["provider-catalog", providerId] as const;
}

export function useCatalog(providerId: string) {
  return useQuery<CatalogItemDto[]>({
    queryKey: catalogQueryKey(providerId),
    queryFn: () => providerClient.listCatalog(providerId),
  });
}

export function useCatalogActions(providerId: string) {
  const queryClient = useQueryClient();
  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: catalogQueryKey(providerId) });

  const create = useMutation({
    mutationFn: (input: CreateCatalogItemRequest) =>
      providerClient.createCatalogItem(providerId, input),
    onSuccess: invalidate,
  });

  const update = useMutation({
    mutationFn: ({
      catalogItemId,
      patch,
    }: {
      catalogItemId: string;
      patch: UpdateCatalogItemRequest;
    }) => providerClient.updateCatalogItem(providerId, catalogItemId, patch),
    onSuccess: invalidate,
  });

  return { create, update };
}
