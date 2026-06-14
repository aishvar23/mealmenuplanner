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
import type { MemberResponseDto } from "@/packages/shared/provider";

import { mapProviderDerivationError } from "./response-errors";
import { getMyResponse } from "./response-read";
import { validateSaveProviderResponse } from "./response-validation";

/**
 * Provider member-response WRITE service (the mutation half of MP-A-130, contract
 * 03 § 6/§ 7/§ 8). Every mutation flows through a SECURITY DEFINER RPC
 * (`pmp_10_response_rpcs`) because the response tables grant SELECT only — the
 * server owns the lifecycle columns and DERIVES quantity/unit from the menu config
 * (design/04 § 9, § 11.6). After each successful mutation the service re-reads the
 * full DTO via `getMyResponse` (RLS self-scoped), so save/confirm/cancel return the
 * exact same shape the GET endpoint serves.
 *
 *   • `saveMyResponse`    — `PUT  /api/provider-menu-days/{id}/my-response`
 *   • `confirmMyResponse` — `POST /api/provider-responses/{id}/confirm`
 *   • `cancelMyResponse`  — `POST /api/provider-responses/{id}/cancel`
 *
 * The RPCs raise custom `PR*` SQLSTATEs (one per provider failure); this module is
 * the single place that maps them to a `DomainError` carrying the contract-03 § 3
 * `details.reason` discriminator. A `404`/`NotFound` is used for an unknown menu
 * day / response (existence-hiding), `403` for membership/approval, `409` for the
 * cutoff/lock/version conflicts, and `400` (with a `ValidationIssue` whose `rule`
 * is the reason) for the menu-alternative / customization validation reasons.
 */

type SupabaseClient = Awaited<ReturnType<typeof createServerSupabaseClient>>;

/** Map a `save_provider_response` RPC error to its domain error (contract 03 § 3). */
function mapSaveError(error: RpcError): never {
  switch (error.code) {
    case "P0002":
      // Unknown / not-visible menu day — existence-hiding 404.
      throw new NotFoundError("Menu not found.");
    case "PRMEM":
      throw new ForbiddenError("You're not a member of this provider.", {
        details: {
          reason: PROVIDER_ERROR_REASONS.provider_membership_required,
        },
      });
    case "PRAPP":
      throw new ForbiddenError("Your membership is awaiting approval.", {
        details: { reason: PROVIDER_ERROR_REASONS.provider_approval_required },
      });
    case "PRPUB":
      throw new ConflictError("This menu isn't open for responses.", {
        reason: PROVIDER_ERROR_REASONS.menu_not_published,
      });
    case "PRLCK":
      throw new ConflictError("This menu is locked.", {
        reason: PROVIDER_ERROR_REASONS.menu_already_locked,
      });
    case "PRCUT":
      throw new ConflictError("Changes are closed for this menu.", {
        reason: PROVIDER_ERROR_REASONS.cutoff_passed,
      });
    case "PRRLK":
      throw new ConflictError("Your response is locked.", {
        reason: PROVIDER_ERROR_REASONS.response_already_locked,
      });
    case "PRVER":
      throw new ConflictError(
        "Your response changed elsewhere. Reload and try again.",
        {
          reason: PROVIDER_ERROR_REASONS.stale_version,
          currentVersion: Number(error.hint ?? 0),
        },
      );
    default:
      // The §11.6 derivation / customization reasons + transient-concurrency +
      // the generic tail are shared verbatim with provider_override_response, so
      // they live in one mapper (mapProviderDerivationError).
      mapProviderDerivationError(error, {
        noun: "response",
        fallback: "Failed to save your response.",
      });
  }
}

/**
 * Map a confirm/cancel RPC error. These share the save guards minus the
 * derivation/validation reasons; `PREMP` (confirm of an empty response) and `PRCAN`
 * (confirm of a cancelled response) are the two extra cases.
 */
function mapTransitionError(error: RpcError): never {
  switch (error.code) {
    case "PREMP":
      throw new ValidationError(
        "Add at least one selection before confirming.",
        [{ field: "items", rule: "required" }],
      );
    case "PRCAN":
      // Confirm of a cancelled response — the member must re-save (revive to draft)
      // first, so a stale pre-cancel item tree can't re-enter the batch.
      throw new ConflictError(
        "This response was cancelled. Reopen and save it before confirming.",
        { reason: PROVIDER_ERROR_REASONS.response_cancelled },
      );
    case "P0002":
      throw new NotFoundError("Response not found.");
    default:
      mapSaveError(error);
  }
}

/**
 * `PUT /api/provider-menu-days/{menuDayId}/my-response` — save the caller's
 * selections (UC-RESPONSE-001..007). The body is validated structurally here; the
 * RPC derives the authoritative quantities and enforces the menu/cutoff/version
 * rules atomically. Returns the full re-read `MemberResponseDto`.
 */
export async function saveMyResponse(
  menuDayId: string,
  body: JsonObject,
): Promise<MemberResponseDto> {
  await requireAuthUser();
  if (!isUuid(menuDayId)) throw new NotFoundError("Menu not found.");
  const input = validateSaveProviderResponse(body);

  const supabase: SupabaseClient = await createServerSupabaseClient();
  const { error } = await supabase.rpc("save_provider_response", {
    p_menu_day_id: menuDayId,
    p_expected_version: input.expectedVersion,
    p_member_note: input.memberNote,
    // camelCase items become the jsonb the RPC reads; the RPC derives quantity/unit.
    p_items: input.items as unknown as Json,
  });
  if (error) mapSaveError(error);

  return getMyResponse(menuDayId);
}

/** Run a confirm/cancel RPC (which returns the response's menu_day_id) and re-read
 * the resulting DTO. A malformed response id is an existence-hiding 404. */
async function runTransition(
  rpc: "confirm_provider_response" | "cancel_provider_response",
  responseId: string,
): Promise<MemberResponseDto> {
  await requireAuthUser();
  if (!isUuid(responseId)) throw new NotFoundError("Response not found.");
  const supabase: SupabaseClient = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc(rpc, {
    p_response_id: responseId,
  });
  if (error) mapTransitionError(error);
  return getMyResponse(data as string);
}

/** `POST /api/provider-responses/{responseId}/confirm` — draft → confirmed. */
export function confirmMyResponse(
  responseId: string,
): Promise<MemberResponseDto> {
  return runTransition("confirm_provider_response", responseId);
}

/** `POST /api/provider-responses/{responseId}/cancel` — → cancelled. */
export function cancelMyResponse(
  responseId: string,
): Promise<MemberResponseDto> {
  return runTransition("cancel_provider_response", responseId);
}
