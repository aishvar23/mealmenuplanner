import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type {
  ProviderBatchDetailDto,
  ProviderBatchSummaryDto,
} from "@mmp/shared/provider";

import { providerClient } from "./client";
import { shareProviderCsv } from "./share";

/**
 * Owner preparation hooks (MP-C-050, the mobile twin of the web Preparation page,
 * spec §13.5). Reads the batch index and a day's full roster through the shared
 * `ProviderApiClient` seam, and runs the owner actions — resend summary email +
 * regenerate — as mutations that invalidate both the open batch and the index, so a
 * single action refreshes the screen. TanStack Query dedupes the keys.
 */

export function batchListQueryKey(providerId: string) {
  return ["provider-batches", providerId] as const;
}

export function batchQueryKey(menuDayId: string) {
  return ["provider-batch", menuDayId] as const;
}

export function useBatchList(providerId: string) {
  return useQuery<ProviderBatchSummaryDto[]>({
    queryKey: batchListQueryKey(providerId),
    queryFn: () => providerClient.listBatches(providerId),
  });
}

export function useBatch(menuDayId: string | null) {
  return useQuery<ProviderBatchDetailDto>({
    queryKey: batchQueryKey(menuDayId ?? "pending"),
    queryFn: () => providerClient.getPreparationBatch(menuDayId as string),
    enabled: menuDayId !== null,
  });
}

export function useBatchActions(providerId: string, menuDayId: string | null) {
  const queryClient = useQueryClient();
  const invalidate = () => {
    queryClient.invalidateQueries({
      queryKey: batchListQueryKey(providerId),
    });
    if (menuDayId) {
      queryClient.invalidateQueries({ queryKey: batchQueryKey(menuDayId) });
    }
  };

  const resendEmail = useMutation({
    mutationFn: (batchId: string) => providerClient.resendSummaryEmail(batchId),
    onSuccess: invalidate,
  });
  const regenerate = useMutation({
    mutationFn: (batchId: string) => providerClient.regenerateBatch(batchId),
    onSuccess: invalidate,
  });

  return { resendEmail, regenerate };
}

type ExportVars = { batchId: string; title: string };

/**
 * Owner export/share actions (MP-C-051, the mobile twin of the web print page). Each
 * mutation fetches a persisted batch revision's CSV through the shared client seam
 * (the same owner-gated `/api/*` routes the web CSV links hit) and hands it to the
 * native share sheet (shareProviderCsv). Read-only — no query invalidation.
 */
export function useBatchExport() {
  const shareAggregate = useMutation({
    mutationFn: async ({ batchId, title }: ExportVars) =>
      shareProviderCsv(await providerClient.getAggregateCsv(batchId), title),
  });
  const sharePerMember = useMutation({
    mutationFn: async ({ batchId, title }: ExportVars) =>
      shareProviderCsv(await providerClient.getIndividualCsv(batchId), title),
  });

  return { shareAggregate, sharePerMember };
}
