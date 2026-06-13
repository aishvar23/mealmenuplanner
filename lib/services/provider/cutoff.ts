import "server-only";

import { mapPgError, type RpcError } from "@/lib/db/rpc-error";
import { createServiceRoleClient } from "@/lib/db/service-role";
import { NotFoundError } from "@/lib/errors";
import { isUuid } from "@/lib/validation/uuid";

/**
 * Provider cutoff service (MP-A-141, contract 03 § 7/§ 10). The TS seam over the
 * `process_provider_cutoff` SECURITY DEFINER RPC (migration `pmp_11_cutoff`). The
 * scheduled sweep (`run_provider_cutoffs`, pg_cron every 5 min) invokes the SQL
 * directly; this seam is the typed entry for ops / integration callers that finalise
 * a single menu day.
 *
 * It runs through the SERVICE-ROLE client by design: the cutoff RPC is granted to
 * `service_role` only (a system job, never user-callable), and every column it writes
 * — response status/auto_accepted/locked_at, the day's lock, the batch totals/lines —
 * is client-never-controlled (design/04 § 9). There is therefore no per-user auth gate
 * here; any future route exposing it must add its own owner/admin guard.
 *
 * Idempotent (ADR-9/10): a re-run on an already-locked day returns the existing
 * current batch without producing a duplicate batch / auto-accept / quantities.
 */

export interface ProviderCutoffResult {
  /**
   * The current preparation batch for the day, or `null` when the day was not a
   * cutoff candidate (not published, or its cutoff has not yet arrived) — the RPC
   * treats those as a safe no-op.
   */
  batchId: string | null;
}

/**
 * Finalise one menu day at its cutoff: auto-accept eligible+consented customers onto
 * the published default package (BR-002/003), lock the confirmed + auto-accepted
 * responses and the day, take the census, and build preparation batch revision 1 with
 * its aggregate lines — all in one transaction (UC-CUTOFF-001).
 */
export async function processProviderCutoff(
  menuDayId: string,
): Promise<ProviderCutoffResult> {
  if (!isUuid(menuDayId)) throw new NotFoundError("Menu not found.");
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase.rpc("process_provider_cutoff", {
    p_menu_day_id: menuDayId,
  });
  if (error) mapCutoffError(error as RpcError);
  return { batchId: data as string | null };
}

/**
 * Map a `process_provider_cutoff` RPC error to its domain error. The RPC raises only
 * `P0002` (unknown menu day) toward the caller — an existence-hiding 404; the shared
 * {@link mapPgError} covers the common tail (`28000` → 401, anything else → 500).
 */
function mapCutoffError(error: RpcError): never {
  if (error.code === "P0002") throw new NotFoundError("Menu not found.");
  mapPgError(error, "Failed to process the menu cutoff.");
}
