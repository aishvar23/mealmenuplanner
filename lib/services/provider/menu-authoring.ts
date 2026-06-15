import "server-only";

import { requireAuthUser } from "@/lib/auth";
import type { Json } from "@/lib/db/database.types";
import { mapPgError, type RpcError } from "@/lib/db/rpc-error";
import { createServerSupabaseClient } from "@/lib/db/server";
import { ConflictError, ValidationError } from "@/lib/errors";
import type { JsonObject } from "@/lib/http";
import { PROVIDER_ERROR_REASONS } from "@/packages/shared/provider";
import type { MenuDayDto } from "@/packages/shared/provider";

import { requireProviderOwner } from "./access";
import { getMenuDay } from "./menu-read";
import { validateCreateMenuDay } from "./menu-authoring-validation";
import { providerOwnerRequiredError } from "./response-errors";
import { parseRpcIssues } from "./rpc-issues";

/**
 * Provider menu AUTHORING service (MP-A-121, contract 03 § 5/§ 8). The builder's
 * create-tree write path — the other ADR-7-independent half of MP-A-121 alongside
 * the fresh-publish writer (`menu-publish.ts`):
 *
 *   • `createMenuDay` — `POST /api/providers/{providerId}/menus`
 *
 * It authors a brand-new DRAFT menu day + its full component tree (components /
 * alternatives / customization groups + options) from one structured builder
 * payload. The builder sends only catalog item IDS + structure; the
 * `create_provider_menu_day` RPC (pmp_19, SECURITY DEFINER) DENORMALIZES every
 * display field — name / quantity / unit / spice-salt — off the OWNER-PRIVATE
 * catalog at authoring time, so the catalog stays owner-private while a customer
 * later reads the published menu (dish names included) without catalog access. A
 * brand-new day has no responses, so this is orthogonal to the ADR-7 edit-after-
 * response revision path (MP-A-012E + the revision rebuild), which ships separately.
 *
 * Ownership is gated up front via {@link requireProviderOwner} so a non-owner (or an
 * unknown/malformed provider id) gets an existence-hiding `NotFoundError` (design/04
 * § 2) before any write; the RPC re-gates as the authoritative backstop. The RPC
 * raises custom SQLSTATEs (`MAOWN`/`MADUP`/`MAINC`); this module is the one place
 * that maps them to the contract-03 § 3 domain errors. The RPC returns the new menu
 * day's id, which we read back through `getMenuDay` to return the full `MenuDayDto`
 * the GET endpoint serves.
 */

/** Map a `create_provider_menu_day` RPC error to its domain error (contract § 3). */
function mapCreateMenuDayError(error: RpcError): never {
  switch (error.code) {
    case "MAOWN":
      throw providerOwnerRequiredError(
        "Only the provider owner can author a menu.",
      );
    case "MADUP":
      throw new ConflictError("A menu already exists for that date.", {
        reason: PROVIDER_ERROR_REASONS.menu_day_exists,
      });
    case "MAINC":
      // A default/alternative references an inactive / cross-provider / dangling
      // catalog item (or the menu is empty) — the same menu_incomplete axis the
      // publish writer's PMINC uses, carrying the per-reference issues.
      throw new ValidationError(
        "This menu references items that aren't available.",
        parseRpcIssues(error.details, [
          { field: "components", rule: PROVIDER_ERROR_REASONS.menu_incomplete },
        ]),
      );
    case "23514":
      // A DB CHECK on a customization group/option (single_choice max=1, bounded
      // increment, required-has-min, qty order) — a malformed customization.
      throw new ValidationError("A customization on this menu is invalid.", [
        {
          field: "components",
          rule: PROVIDER_ERROR_REASONS.invalid_customization,
        },
      ]);
    case "23505":
      // A duplicate selection that slipped past the validator (a repeated alternative,
      // an alternative equal to the default, or a repeated customization option code)
      // tripped a unique index. The service validator catches these up front with a
      // field-scoped path; this is the DB backstop for a direct RPC call.
      throw new ValidationError("This menu has a duplicate selection.", [
        { field: "components", rule: "duplicate" },
      ]);
    case "22P02":
      // A malformed enum / uuid that slipped past validation.
      throw new ValidationError("Some menu details are invalid.", [
        { field: "components", rule: "invalid" },
      ]);
    default:
      // 28000 → 401; anything else → 500 (original kept as cause, never serialized).
      mapPgError(error, "Failed to create the menu.");
  }
}

/**
 * `POST /api/providers/{providerId}/menus` — author a new DRAFT menu day with its
 * full component tree (UC-MENU-001/002). Owner-only. The body is validated to a
 * clean camelCase payload, then the RPC builds the tree atomically (denormalizing
 * display fields off the owner-private catalog) and returns the new day id, which we
 * read back as the `MenuDayDto`. Failures: `400` invalid body / `menu_incomplete`
 * (bad item refs / malformed customization), `403` owner-required (existence-hidden
 * to `404` before the write), `409` `menu_day_exists`.
 */
export async function createMenuDay(
  providerId: string,
  body: JsonObject,
): Promise<MenuDayDto> {
  await requireAuthUser();
  const supabase = await createServerSupabaseClient();
  // Existence-hiding owner gate up front (a non-owner / unknown / malformed id → 404).
  await requireProviderOwner(supabase, providerId);

  const payload = validateCreateMenuDay(body);

  const { data, error } = await supabase.rpc("create_provider_menu_day", {
    p_provider_id: providerId,
    p_payload: payload as unknown as Json,
  });
  if (error) mapCreateMenuDayError(error);
  if (!data) {
    // Defensive: the RPC always returns the new id on success.
    throw new ValidationError("Failed to create the menu.", [
      { field: "components", rule: PROVIDER_ERROR_REASONS.menu_incomplete },
    ]);
  }

  return getMenuDay(data);
}
