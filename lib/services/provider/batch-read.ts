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
import type {
  ProviderBatchDetailDto,
  ProviderBatchSummaryDto,
} from "@/packages/shared/provider";

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
 * the rosters + `menuDate`/`revision`; later surfaces reuse the rest. This IS the shared
 * `ProviderBatchDetailDto` the preparation-batch route returns (kept as a named alias so
 * existing server/web imports are unchanged).
 */
export type ProviderBatchReadDto = ProviderBatchDetailDto;

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

/** Embedded shape for the batch-index read (current revisions + their menu day). */
type BatchSummaryRow = {
  id: string;
  menu_day_id: string;
  revision: number;
  status: "current" | "stale";
  generated_at: string;
  email_status: "queued" | "sent" | "failed" | null;
  total_confirmed: number;
  total_auto_accepted: number;
  total_cancelled: number;
  total_no_response: number;
  provider_menu_days: { menu_date: string; cutoff_at: string };
};

/**
 * `list_provider_batches` foundation (MP-B-050; contract 03 § 8) — the owner's index of
 * generated batches, one row per menu day's CURRENT revision, newest day first. The
 * entry point of the preparation UI: an owner lands here, then opens a day to read its
 * roster (`getProviderBatch`).
 *
 * No SECURITY DEFINER RPC is needed — batches and menu days are both owner-SELECT-only
 * under RLS (`ppb_select`/`pmd_select`, design/04 § 6), so a request-scoped read returns
 * exactly the caller-owner's current batches and an empty list for a non-owner (the
 * existence-hidden posture the rest of the provider surface takes — no leak). Stale
 * revisions are excluded: only the current revision per day reconciles and is readable.
 */
export async function listProviderBatches(
  providerId: string,
): Promise<ProviderBatchSummaryDto[]> {
  await requireAuthUser();
  // A non-uuid can never name a real provider — return the empty index (don't round-trip).
  if (!isUuid(providerId)) return [];

  const supabase: SupabaseClient = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("provider_preparation_batches")
    .select(
      "id, menu_day_id, revision, status, generated_at, email_status, " +
        "total_confirmed, total_auto_accepted, total_cancelled, total_no_response, " +
        "provider_menu_days!inner(menu_date, cutoff_at)",
    )
    .eq("provider_id", providerId)
    .eq("status", "current")
    .returns<BatchSummaryRow[]>();
  if (error) {
    if (error.code === "28000") throw new UnauthenticatedError();
    throw new InternalError("Failed to load preparation batches.", {
      cause: error,
    });
  }

  return (data ?? [])
    .map(
      (row): ProviderBatchSummaryDto => ({
        batchId: row.id,
        menuDayId: row.menu_day_id,
        menuDate: row.provider_menu_days.menu_date,
        cutoffAt: row.provider_menu_days.cutoff_at,
        revision: row.revision,
        status: row.status,
        generatedAt: row.generated_at,
        emailStatus: row.email_status,
        totals: {
          confirmed: row.total_confirmed,
          autoAccepted: row.total_auto_accepted,
          cancelled: row.total_cancelled,
          noResponse: row.total_no_response,
        },
      }),
    )
    .sort((a, b) => b.menuDate.localeCompare(a.menuDate));
}

/**
 * `getPreparationBatch(menuDayId)` (MP-B-050; contract 03 § 8) — the full roster of a menu
 * day's CURRENT batch, resolved by menu day rather than batch id (the shape the mobile
 * client and the day-anchored navigation use). Resolves the day's current batch id under
 * RLS (owner-only; a non-owner or a day with no batch is existence-hidden as 404), then
 * delegates to `getProviderBatch`, so the owner gate, stale-revision (409) and
 * not-found (404) postures are identical to the by-id read.
 */
export async function getProviderBatchForMenuDay(
  menuDayId: string,
): Promise<ProviderBatchReadDto> {
  await requireAuthUser();
  if (!isUuid(menuDayId)) throw new NotFoundError("Batch not found.");

  const supabase: SupabaseClient = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("provider_preparation_batches")
    .select("id")
    .eq("menu_day_id", menuDayId)
    .eq("status", "current")
    .maybeSingle();
  if (error) {
    if (error.code === "28000") throw new UnauthenticatedError();
    throw new InternalError("Failed to load the preparation batch.", {
      cause: error,
    });
  }
  if (!data) throw new NotFoundError("Batch not found.");

  return getProviderBatch(data.id);
}
