import "server-only";

import { mapPgError, type RpcError } from "@/lib/db/rpc-error";
import { createServerSupabaseClient } from "@/lib/db/server";
import { ConflictError, NotFoundError, ValidationError } from "@/lib/errors";
import { isUuid } from "@/lib/validation/uuid";
import {
  PROVIDER_ERROR_REASONS,
  validateMenuCompleteness,
} from "@/packages/shared/provider";
import type { MenuDayDto } from "@/packages/shared/provider";

import { getMenuDay } from "./menu-read";
import { providerOwnerRequiredError } from "./response-errors";
import { parseRpcIssues } from "./rpc-issues";

/**
 * Provider menu PUBLISH service (MP-A-121, contract 03 § 5/§ 8). The fresh-publish
 * writer: an owner publishes a DRAFT menu day so its active customers can read it
 * and respond. (ADR-7 #30 is decided = REVISION; the edit-after-response revision
 * path — MP-A-012E + revision rebuild — ships separately. Publishing a draft has no
 * existing responses, so it is ADR-7-independent.)
 *
 *   • `publishMenuDay` — `POST /api/provider-menu-days/{id}/publish`
 *
 * Completeness is enforced on two axes (contract § 5):
 *   1. STRUCTURAL — the pure `validateMenuCompleteness` (@mmp/shared, ADO #84),
 *      reused here against the persisted MenuDayDto: required defaults present +
 *      named, positive quantities, consistent units, bounded quantity_increment
 *      customizations, future cutoff. Failures → 400 with the `ValidationIssue[]`.
 *   2. DB-CONTEXT — the `publish_provider_menu_day` RPC (pmp_18, SECURITY DEFINER):
 *      every default + active alternative references an ACTIVE catalog item OWNED by
 *      this provider (no archived/cross-provider/dangling id). It owner-gates,
 *      draft-gates, flips the day + weekly container to published, and fans out
 *      `provider_menu_published` to active customers, all atomically.
 *
 * The RPC raises custom SQLSTATEs (`PMOWN`/`PMNDR`/`PMINC`); this module is the one
 * place that maps them to the contract-03 § 3 domain errors. The RPC returns the
 * day's `published_at`, so after a successful publish the service patches its already-
 * read DTO (status → published) instead of issuing a second full menu-tree read — the
 * route still returns the same `MenuDayDto` shape the GET endpoint serves.
 */

/** Map a `publish_provider_menu_day` RPC error to its domain error (contract § 3). */
function mapPublishError(error: RpcError): never {
  switch (error.code) {
    case "P0002":
      // Unknown / not-visible menu day — existence-hiding 404.
      throw new NotFoundError("Menu not found.");
    case "PMOWN":
      throw providerOwnerRequiredError(
        "Only the provider owner can publish a menu.",
      );
    case "PMNDR":
      throw new ConflictError("This menu can no longer be published.", {
        reason: PROVIDER_ERROR_REASONS.menu_not_draft,
      });
    case "PMINC":
      // DB-context completeness failure (inactive / cross-provider / dangling item).
      // Surface as the same menu_incomplete VALIDATION_ERROR the structural axis uses,
      // carrying the per-reference issues the RPC reported.
      throw new ValidationError(
        "This menu isn't ready to publish.",
        parseRpcIssues(error.details, [
          { field: "components", rule: PROVIDER_ERROR_REASONS.menu_incomplete },
        ]),
      );
    default:
      // 28000 → 401; anything else → 500 (original kept as cause, never serialized).
      mapPgError(error, "Failed to publish the menu.");
  }
}

/**
 * `POST /api/provider-menu-days/{menuDayId}/publish` — publish a draft menu day
 * (UC-MENU-003). Owner-only. The structural axis is gated here (reusing the shared
 * validator); the DB-context axis + the future-cutoff backstop + the atomic
 * transition + the published fan-out are the RPC. Returns the `MenuDayDto` (now
 * `published`). A malformed / unreadable id is an existence-hiding 404 before any
 * write.
 */
export async function publishMenuDay(menuDayId: string): Promise<MenuDayDto> {
  if (!isUuid(menuDayId)) throw new NotFoundError("Menu not found.");

  // Owner reads any status via RLS, so this loads the draft tree (and authenticates);
  // a non-owner / unknown id is a NotFoundError (existence-hiding) before any mutation.
  const menuDay = await getMenuDay(menuDayId);

  // Structural completeness (contract § 5, the #84 pure slice) is gated only for a
  // DRAFT — fail fast with the full issue set. An already-published day is an
  // idempotent replay (the RPC owner-gates then no-ops), so it skips this check: a
  // published menu whose cutoff has since lapsed must still re-publish cleanly rather
  // than spuriously fail the cutoff-in-past structural rule.
  if (menuDay.status === "draft") {
    const issues = validateMenuCompleteness(menuDay, new Date());
    if (issues.length > 0) {
      throw new ValidationError("This menu isn't ready to publish.", issues);
    }
  }

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("publish_provider_menu_day", {
    p_menu_day_id: menuDayId,
  });
  if (error) mapPublishError(error);

  // Publishing flips only status + published_at; the component tree just read is
  // unchanged, so patch the DTO with the RPC's authoritative published_at instead of
  // a second full menu-tree read.
  return { ...menuDay, status: "published", publishedAt: data };
}
