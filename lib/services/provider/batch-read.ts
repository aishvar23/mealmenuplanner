import "server-only";

import { requireAuthUser } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/db/server";
import {
  ConflictError,
  ForbiddenError,
  InternalError,
  NotFoundError,
  UnauthenticatedError,
} from "@/lib/errors";
import { isUuid } from "@/lib/validation/uuid";
import { PROVIDER_ERROR_REASONS } from "@/packages/shared/provider";
import type { BatchDto } from "@/packages/shared/provider";

/**
 * Preparation batch read (MP-A-160 foundation; contract 03 § 10). The owner-gated
 * read behind the CSV exports — and, later, the print page (MP-B-051), the summary
 * email (MP-A-161), and the preparation UI (MP-B-050). It calls the `get_provider_batch`
 * SECURITY DEFINER RPC (design/04 § 9), which:
 *   • reads the aggregate roster from the PERSISTED, immutable batch lines;
 *   • rebuilds the per-member breakdown from the day's locked eligible responses
 *     with the same eligibility + included/extra rules the persisted aggregate used
 *     (the shared `provider_member_breakdown_lines` helper — so it reconciles);
 *   • projects member display names across `users` (self-only RLS).
 * The RPC self-gates on owner: a non-owner gets `PROWN` → 403; a missing/foreign
 * batch is existence-hidden as `P0002` → 404 (mirrors override/regenerate); a
 * superseded (non-current) revision gets `PRSTL` → 409 `batch_stale`, since its
 * persisted aggregate and the live responses no longer agree.
 */

type SupabaseClient = Awaited<ReturnType<typeof createServerSupabaseClient>>;

/**
 * The full batch detail: the wire `BatchDto` plus the print/email/filename context
 * (`providerName`, `menuDate`, `cutoffAt`) the same RPC returns. The CSV export uses
 * the rosters + `menuDate`/`revision`; later surfaces reuse the rest.
 */
export interface ProviderBatchReadDto extends BatchDto {
  providerName: string;
  menuDate: string;
  cutoffAt: string;
}

/** `get_provider_batch` — the owner-gated batch detail for `batchId`. */
export async function getProviderBatch(
  batchId: string,
): Promise<ProviderBatchReadDto> {
  await requireAuthUser();
  // A non-uuid can never name a real batch — existence-hide as 404 (don't round-trip).
  if (!isUuid(batchId)) throw new NotFoundError("Batch not found.");

  const supabase: SupabaseClient = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("get_provider_batch", {
    p_batch_id: batchId,
  });
  if (error) {
    switch (error.code) {
      case "P0002":
        throw new NotFoundError("Batch not found.");
      case "PROWN":
        throw new ForbiddenError("Only the provider owner can do that.", {
          details: { reason: PROVIDER_ERROR_REASONS.provider_owner_required },
        });
      case "PRSTL":
        // The requested revision has been superseded (an override + regenerate
        // moved 'current' on). Only the current revision reconciles, so refuse the
        // stale one rather than export an inconsistent roster.
        throw new ConflictError(
          "This batch has been superseded by a newer revision.",
          { reason: PROVIDER_ERROR_REASONS.batch_stale },
        );
      case "28000":
        throw new UnauthenticatedError();
      default:
        throw new InternalError("Failed to load the preparation batch.", {
          cause: error,
        });
    }
  }
  return data as unknown as ProviderBatchReadDto;
}
