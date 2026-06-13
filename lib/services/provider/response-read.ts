import "server-only";

import { requireAuthUser } from "@/lib/auth";
import type { Database } from "@/lib/db/database.types";
import { createServerSupabaseClient } from "@/lib/db/server";
import { NotFoundError } from "@/lib/errors";
import { isUuid } from "@/lib/validation/uuid";
import type { MemberResponseDto } from "@/packages/shared/provider";

import { mapReadError, numOrNull, type SupabaseClient } from "./read-utils";

/**
 * Provider member-response READ service (the read half of MP-A-130, contract
 * 03 § 8). The mutation path — `save_provider_response` (quantity derivation,
 * cutoff + optimistic-concurrency enforcement), confirm, cancel — is the rest of
 * MP-A-130 and ships separately; nothing here mutates.
 *
 *   • `getMyResponse` — `GET /api/provider-menu-days/{id}/my-response`; the
 *     caller's own response to one menu day, with its full item/customization
 *     tree. Returns the contract's "no response yet" shape (`responseId: null`,
 *     `status: 'no_response'`, empty `items`) when the caller has not responded.
 *
 * Authorization is RLS-driven (migration `pmp_5_responses`): the member reads only
 * their own response (the owner reads all, but `getMyResponse` is the member's own
 * view, so it ALSO filters `member_user_id = caller` — without that an owner, who
 * can read every response for the day, would match more than one row). A response
 * only ever exists for a menu day the caller could see, so an unreadable/unknown
 * day simply yields the empty shape — never leaking the day's existence. A
 * malformed id short-circuits to a 404 before any round trip (avoids a `22P02`
 * cast error surfacing as a 500), mirroring the menu reads.
 *
 * Route handlers stay thin: parse, call, serialize. `numeric` columns arrive as
 * strings via PostgREST and are coerced to numbers here at the boundary.
 */

/** The response projection: the response + its nested item/customization tree. */
const MY_RESPONSE_SELECT: string = `
  id, status, version, member_note, locked_at,
  items:provider_member_response_items(
    menu_component_id, selected_catalog_item_id, quantity, canonical_unit,
    spice_level, salt_level,
    customizations:provider_member_response_customizations(
      customization_option_id, quantity
    )
  )
`;

// ── raw PostgREST row shapes (nested embeds arrive as arrays) ──
interface RawCustomization {
  customization_option_id: string;
  quantity: number | string | null;
}
interface RawItem {
  menu_component_id: string;
  selected_catalog_item_id: string;
  quantity: number | string;
  canonical_unit: string;
  spice_level: Database["public"]["Enums"]["provider_spice_level"] | null;
  salt_level: Database["public"]["Enums"]["provider_salt_level"] | null;
  customizations: RawCustomization[] | null;
}
interface RawResponse {
  id: string;
  status: Database["public"]["Enums"]["provider_response_status"];
  version: number;
  member_note: string | null;
  locked_at: string | null;
  items: RawItem[] | null;
}

/** The contract's "caller has not responded yet" shape (§ 4). */
function emptyResponse(menuDayId: string): MemberResponseDto {
  return {
    responseId: null,
    menuDayId,
    status: "no_response",
    version: 0,
    memberNote: null,
    items: [],
    lockedAt: null,
  };
}

/** Map a response projection row to its wire DTO (snake_case → camelCase). */
function toMemberResponseDto(
  row: RawResponse,
  menuDayId: string,
): MemberResponseDto {
  return {
    responseId: row.id,
    menuDayId,
    status: row.status,
    version: row.version,
    memberNote: row.member_note,
    lockedAt: row.locked_at,
    items: (row.items ?? []).map((item) => ({
      menuComponentId: item.menu_component_id,
      selectedCatalogItemId: item.selected_catalog_item_id,
      quantity: Number(item.quantity),
      canonicalUnit: item.canonical_unit,
      spiceLevel: item.spice_level,
      saltLevel: item.salt_level,
      customizations: (item.customizations ?? []).map((customization) => ({
        customizationOptionId: customization.customization_option_id,
        quantity: numOrNull(customization.quantity),
      })),
    })),
  };
}

/**
 * `GET /api/provider-menu-days/{menuDayId}/my-response` — the caller's own
 * response to the day, or the empty "no response yet" shape. RLS self-scopes to
 * the caller's own row; an unreadable/unknown day or a not-yet-answered day both
 * yield the empty shape (existence-hiding). A malformed id is a 404.
 */
export async function getMyResponse(
  menuDayId: string,
): Promise<MemberResponseDto> {
  const user = await requireAuthUser();
  if (!isUuid(menuDayId)) throw new NotFoundError("Menu not found.");
  const supabase: SupabaseClient = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("provider_member_responses")
    .select(MY_RESPONSE_SELECT)
    .eq("menu_day_id", menuDayId)
    .eq("member_user_id", user.id)
    .maybeSingle();
  if (error) mapReadError(error, "Failed to load your response.");
  if (!data) return emptyResponse(menuDayId);
  return toMemberResponseDto(data as unknown as RawResponse, menuDayId);
}
