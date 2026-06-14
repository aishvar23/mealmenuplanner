import "server-only";

import { requireAuthUser } from "@/lib/auth";
import type { Json } from "@/lib/db/database.types";
import { type RpcError } from "@/lib/db/rpc-error";
import { createServerSupabaseClient } from "@/lib/db/server";
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "@/lib/errors";
import type { JsonObject } from "@/lib/http";
import { isUuid } from "@/lib/validation/uuid";
import { PROVIDER_ERROR_REASONS } from "@/packages/shared/provider";
import type {
  ProviderBatchRevisionDto,
  ProviderOverrideResultDto,
} from "@/packages/shared/provider";

import { mapProviderDerivationError } from "./response-errors";
import { validateProviderOverride } from "./response-validation";

/**
 * Provider override + batch-regenerate service (MP-A-150, contract 03 § 7/§ 8/§ 9;
 * UC-OVERRIDE-001/002, BR-007, ADR-11). The owner-facing post-cutoff correction path.
 * Both mutations flow through a SECURITY DEFINER RPC (`pmp_12_override_regenerate`)
 * that self-gates on `is_provider_owner` and DERIVES every authoritative quantity/unit/
 * total/revision (the underlying tables grant SELECT only — design/04 § 9). They run
 * through the per-request server client (RLS/auth context) so the RPC's `auth.uid()`
 * owner check resolves to the caller; a non-owner gets `PROWN` → 403.
 *
 *   • `overrideResponse`  — `POST /api/provider-responses/{id}/provider-override`
 *   • `regenerateBatch`   — `POST /api/provider-preparation-batches/{id}/regenerate`
 *
 * The RPCs raise custom `PR*` SQLSTATEs; this module maps them to a `DomainError`
 * carrying the contract-03 § 3 `details.reason` discriminator (no new top-level code).
 */

type SupabaseClient = Awaited<ReturnType<typeof createServerSupabaseClient>>;

/** Map an override / regenerate RPC error (contract 03 § 3). */
function mapOverrideError(error: RpcError): never {
  switch (error.code) {
    case "P0002":
      // Unknown / not-visible response or batch — existence-hiding 404.
      throw new NotFoundError("Not found.");
    case "PROWN":
      throw new ForbiddenError("Only the provider owner can do that.", {
        details: { reason: PROVIDER_ERROR_REASONS.provider_owner_required },
      });
    case "PRRSN":
      // Mandatory override reason missing (BR-007) — a field-scoped 400.
      throw new ValidationError("An override reason is required.", [
        { field: "reason", rule: "required" },
      ]);
    case "PRNLK":
      // Override attempted before the menu day is locked (cutoff not passed).
      throw new ConflictError("This menu isn't locked yet.", {
        reason: PROVIDER_ERROR_REASONS.menu_not_locked,
      });
    case "PREMP":
      // An override may not leave an empty order (mirrors confirm's PREMP): an
      // empty override would still count as 'confirmed' in the census yet add no
      // roster lines. To clear a member's order the owner cancels it instead.
      throw new ValidationError(
        "An override can't leave an empty order. Cancel the response instead.",
        [{ field: "items", rule: "required" }],
      );
    default:
      // The §11.6 derivation / customization reasons + transient-concurrency +
      // the generic tail are shared verbatim with save_provider_response.
      mapProviderDerivationError(error, {
        noun: "override",
        fallback: "Failed to apply the override.",
      });
  }
}

/**
 * `POST /api/provider-responses/{responseId}/provider-override` — the owner corrects a
 * locked member response after cutoff (UC-OVERRIDE-001). Validates the body (mandatory
 * reason + corrected items); the RPC enforces owner + locked-day + menu derivation
 * atomically, preserves the prior order in the audit, and marks the batch stale.
 */
export async function overrideResponse(
  responseId: string,
  body: JsonObject,
): Promise<ProviderOverrideResultDto> {
  await requireAuthUser();
  if (!isUuid(responseId)) throw new NotFoundError("Response not found.");
  const input = validateProviderOverride(body);

  const supabase: SupabaseClient = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("provider_override_response", {
    p_response_id: responseId,
    p_reason: input.reason,
    // camelCase items become the jsonb the RPC reads; the RPC derives quantity/unit.
    p_items: input.items as unknown as Json,
  });
  if (error) mapOverrideError(error);
  return data as unknown as ProviderOverrideResultDto;
}

/**
 * `POST /api/provider-preparation-batches/{batchId}/regenerate` — the owner rebuilds the
 * preparation roster as a new immutable revision N+1 (UC-OVERRIDE-002). The summary
 * email is NOT auto-resent.
 */
export async function regenerateBatch(
  batchId: string,
): Promise<ProviderBatchRevisionDto> {
  await requireAuthUser();
  if (!isUuid(batchId)) throw new NotFoundError("Batch not found.");

  const supabase: SupabaseClient = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("regenerate_provider_batch", {
    p_batch_id: batchId,
  });
  if (error) mapOverrideError(error);
  return data as unknown as ProviderBatchRevisionDto;
}
