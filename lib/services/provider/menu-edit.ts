import "server-only";

import type { Json } from "@/lib/db/database.types";
import { mapPgError, type RpcError } from "@/lib/db/rpc-error";
import { createServerSupabaseClient } from "@/lib/db/server";
import {
  ConflictError,
  NotFoundError,
  ValidationError,
  type ValidationIssue,
} from "@/lib/errors";
import type { JsonObject } from "@/lib/http";
import { isUuid } from "@/lib/validation/uuid";
import { PROVIDER_ERROR_REASONS } from "@/packages/shared/provider";
import type { MenuDayDto } from "@/packages/shared/provider";

import { validateCreateMenuDay } from "./menu-authoring-validation";
import { getMenuDay } from "./menu-read";
import { providerOwnerRequiredError } from "./response-errors";
import { parseRpcIssues } from "./rpc-issues";
import { optionalText } from "./text-validators";

/**
 * Provider menu STRUCTURAL-EDIT + REVISION service (MP-A-012E + MP-A-121, ADR-7 #30 =
 * REVISION; contract 03 § 5/§ 8; UC-MENU-004/005). The edit half of the menu writer,
 * unblocked by the ADR-7 decision — the sibling of the fresh-publish (`menu-publish.ts`)
 * and create-tree authoring (`menu-authoring.ts`) writers:
 *
 *   • `reviseMenuDay`      — `PUT   /api/provider-menu-days/{id}` — a STRUCTURAL edit
 *     (full component tree + cutoff). The `edit_provider_menu_day` RPC (pmp_20) realises
 *     the MP-A-012E guard: when NO member has responded it rebuilds the tree IN PLACE;
 *     once a response exists it creates a NEW revision (rev N+1), carries existing
 *     responses forward + re-validates them, selectively invalidates the ones whose
 *     order no longer fits (resetting them to draft + notifying the member to
 *     re-confirm), and archives the prior revision. Returns the resulting LIVE day.
 *   • `updateMenuDayNote`  — `PATCH /api/provider-menu-days/{id}` — a NON-STRUCTURAL
 *     edit (note only), applied IN PLACE regardless of responses (never a revision).
 *
 * Both reuse `getMenuDay` for the initial existence/auth read (a non-owner customer who
 * can read a published day by RLS is still rejected by the RPC's owner gate, mirroring
 * `publishMenuDay`). The day's DATE is immutable, so the edit payload carries no
 * `menuDate`; the existing date is injected before reusing the authoring validator. The
 * RPC raises custom SQLSTATEs (`MEOWN`/`MESTA`/`MECUT`) plus the shared tree-build
 * `MAINC`; this module is the one place that maps them to the contract-03 § 3 errors.
 */

const NOTE_MAX = 500;

/** Map an `edit_provider_menu_day` RPC error to its domain error (contract § 3). */
function mapEditError(error: RpcError): never {
  switch (error.code) {
    case "P0002":
      throw new NotFoundError("Menu not found.");
    case "MEOWN":
      throw providerOwnerRequiredError(
        "Only the provider owner can edit a menu.",
      );
    case "MESTA":
      // The day is locked / archived / cancelled / superseded, or its cutoff has already
      // passed — revisions are allowed before cutoff only.
      throw new ConflictError("This menu can no longer be edited.", {
        reason: PROVIDER_ERROR_REASONS.menu_not_editable,
      });
    case "MECUT":
      // The new cutoff is not in the future (a revision cannot reopen a closed window).
      throw new ValidationError("The cutoff must be in the future.", [
        { field: "cutoffAt", rule: PROVIDER_ERROR_REASONS.cutoff_invalid },
      ]);
    case "MAINC":
      // A default/alternative references an inactive / cross-provider / dangling catalog
      // item (or the menu is empty) — the shared tree-build axis create/publish use.
      throw new ValidationError(
        "This menu references items that aren't available.",
        parseRpcIssues(error.details, [
          { field: "components", rule: PROVIDER_ERROR_REASONS.menu_incomplete },
        ]),
      );
    case "23514":
      // A customization-group/option DB CHECK (single_choice max=1, bounded increment,
      // required-has-min, qty order) — a malformed customization.
      throw new ValidationError("A customization on this menu is invalid.", [
        {
          field: "components",
          rule: PROVIDER_ERROR_REASONS.invalid_customization,
        },
      ]);
    case "23505":
      // A duplicate selection (repeated alternative, alternative equal to default, or a
      // repeated customization option code) that slipped past the validator.
      throw new ValidationError("This menu has a duplicate selection.", [
        { field: "components", rule: "duplicate" },
      ]);
    case "22P02":
      throw new ValidationError("Some menu details are invalid.", [
        { field: "components", rule: "invalid" },
      ]);
    case "40P01": // deadlock_detected
    case "40001": // serialization_failure
      // A transient concurrency abort: the edit RPC locks the day row then derives every
      // carried response, so a concurrent member save / cutoff sweep on the same day can
      // abort it. A clean retryable 409 (mirroring response-errors.ts), never an opaque
      // 500 — the owner can simply re-issue the edit.
      throw new ConflictError(
        "A concurrent change interrupted your request. Please retry.",
        undefined,
        { cause: error },
      );
    default:
      // 28000 → 401; anything else → 500 (original kept as cause, never serialized).
      mapPgError(error, "Failed to edit the menu.");
  }
}

/** Map an `update_provider_menu_day_note` RPC error to its domain error. */
function mapNoteError(error: RpcError): never {
  switch (error.code) {
    case "P0002":
      throw new NotFoundError("Menu not found.");
    case "MEOWN":
      throw providerOwnerRequiredError(
        "Only the provider owner can edit a menu.",
      );
    case "MESTA":
      throw new ConflictError("This menu can no longer be edited.", {
        reason: PROVIDER_ERROR_REASONS.menu_not_editable,
      });
    case "40P01": // deadlock_detected
    case "40001": // serialization_failure
      // The note RPC also locks the day row FOR UPDATE — a transient abort is a clean
      // retryable 409, not a 500 (mirrors response-errors.ts + mapEditError).
      throw new ConflictError(
        "A concurrent change interrupted your request. Please retry.",
        undefined,
        { cause: error },
      );
    default:
      mapPgError(error, "Failed to update the menu note.");
  }
}

/**
 * `PUT /api/provider-menu-days/{menuDayId}` — a structural edit of an existing menu day
 * (UC-MENU-004/005). Owner-only, before cutoff. The body (`EditMenuDayInput`: cutoffAt +
 * note + the full desired component tree) is validated to the clean camelCase payload
 * the authoring validator already produces — the day's own date is injected (it cannot
 * change). The RPC then applies the ADR-7 policy (in-place rebuild when no response
 * exists, else a rev N+1 with carry-forward + selective invalidation + re-confirm
 * notifications) and returns the LIVE day id, which we read back as the `MenuDayDto`.
 */
export async function reviseMenuDay(
  menuDayId: string,
  body: JsonObject,
): Promise<MenuDayDto> {
  if (!isUuid(menuDayId)) throw new NotFoundError("Menu not found.");

  // Owner reads any status via RLS (authenticates + existence-hides an unknown id); the
  // day's immutable date is needed so the shared authoring validator can run unchanged.
  const menuDay = await getMenuDay(menuDayId);
  const payload = validateCreateMenuDay({
    ...body,
    menuDate: menuDay.menuDate,
  });

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("edit_provider_menu_day", {
    p_menu_day_id: menuDayId,
    p_payload: payload as unknown as Json,
  });
  if (error) mapEditError(error);
  if (!data) {
    // Defensive: the RPC always returns the resulting live day id on success.
    throw new ValidationError("Failed to edit the menu.", [
      { field: "components", rule: PROVIDER_ERROR_REASONS.menu_incomplete },
    ]);
  }

  // `data` is the live day id — the same id for an in-place edit, the new revision's id
  // when one was created. Read it back as the full DTO the GET endpoint serves.
  return getMenuDay(data);
}

/**
 * `PATCH /api/provider-menu-days/{menuDayId}` — a non-structural note edit, applied in
 * place (ADR-7; never a revision). Owner-only. Returns the updated `MenuDayDto`.
 */
export async function updateMenuDayNote(
  menuDayId: string,
  body: JsonObject,
): Promise<MenuDayDto> {
  if (!isUuid(menuDayId)) throw new NotFoundError("Menu not found.");

  const issues: ValidationIssue[] = [];
  const note = optionalText(body.note, "note", issues, NOTE_MAX);
  if (issues.length > 0) {
    throw new ValidationError("Some menu details are invalid.", issues);
  }

  // Authenticate + existence-hide before the write (RLS); the RPC owner-gates.
  await getMenuDay(menuDayId);

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.rpc("update_provider_menu_day_note", {
    p_menu_day_id: menuDayId,
    p_note: note ?? null,
  });
  if (error) mapNoteError(error);

  // The note change is in place (same day id) — return the refreshed DTO.
  return getMenuDay(menuDayId);
}
