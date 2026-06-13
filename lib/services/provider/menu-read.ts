import "server-only";

import { requireAuthUser } from "@/lib/auth";
import type { Database } from "@/lib/db/database.types";
import { createServerSupabaseClient } from "@/lib/db/server";
import { NotFoundError } from "@/lib/errors";
import { isUuid } from "@/lib/validation/uuid";
import type {
  CustomizationGroupDto,
  MenuComponentDto,
  MenuDayDto,
} from "@/packages/shared/provider";

import { mapReadError, numOrNull, type SupabaseClient } from "./read-utils";

/**
 * Provider menu READ service (MP-A-120, contract 03 § 8). The read-only half of
 * the menu surface — authoring/publish (MP-A-121) and the edit-after-response
 * guard (MP-A-012E) are BLOCKED on ADR-7 and ship separately; nothing here mutates.
 *
 *   • `getMenuDay`      — `GET /api/provider-menu-days/{id}`; one day + its full
 *     component tree (alternatives + customizations).
 *   • `getTodayMenu`    — `GET /api/providers/{id}/today-menu`; the day for "today"
 *     in the provider's timezone, or `null`.
 *   • `getWeeklyMenu`   — `GET /api/providers/{id}/weekly-menu`; the 7-day window
 *     [today, today+6] in the provider's timezone, date-ordered.
 *
 * Authorization is RLS-driven (migration `pmp_4_menu`): the owner reads any status;
 * an approved (active) customer reads only `published`/`locked` days. So a customer
 * (or an awaiting/removed member, who is not active) simply sees no row — and
 * `getMenuDay` answers an unreadable/unknown id with an existence-hiding
 * `NotFoundError` (design/04 § 2), never leaking whether the day exists. A
 * malformed id short-circuits to the same 404 before any round trip (avoids a
 * `22P02` cast error surfacing as a 500).
 *
 * The component tree carries spice/salt affordances DENORMALIZED onto the
 * component (migration header), so a customer reads a menu WITHOUT any access to
 * the owner-private catalog — this projection never embeds `provider_catalog_items`.
 * Route handlers stay thin: parse, call one of these, serialize. `numeric` columns
 * arrive as strings via PostgREST and are coerced to numbers here at the boundary.
 */

/** The menu-day projection: the day + its nested component tree, no `*`. */
const MENU_DAY_SELECT: string = `
  id, provider_id, weekly_menu_id, menu_date, cutoff_at, status, note, published_at, locked_at,
  components:provider_menu_components(
    id, component_group, default_catalog_item_id, default_quantity, canonical_unit,
    is_required, supports_spice_level, supports_salt_level, sort_order,
    alternatives:provider_menu_alternatives(id, catalog_item_id, quantity, canonical_unit, is_active),
    customization_groups:provider_customization_groups(
      id, name, customization_type, included_in_price, is_required,
      minimum_selections, maximum_selections, sort_order,
      options:provider_customization_options(
        id, code, label, quantity_delta, canonical_unit, external_price_label,
        minimum_quantity, maximum_quantity, is_active, sort_order
      )
    )
  )
`;

// ── raw PostgREST row shapes (nested embeds arrive as arrays) ──
interface RawOption {
  id: string;
  code: string;
  label: string;
  quantity_delta: number | string | null;
  canonical_unit: string | null;
  external_price_label: string | null;
  minimum_quantity: number | string | null;
  maximum_quantity: number | string | null;
  is_active: boolean;
  sort_order: number;
}
interface RawGroup {
  id: string;
  name: string;
  customization_type: Database["public"]["Enums"]["provider_customization_type"];
  included_in_price: boolean;
  is_required: boolean;
  minimum_selections: number;
  maximum_selections: number | null;
  sort_order: number;
  options: RawOption[] | null;
}
interface RawAlternative {
  id: string;
  catalog_item_id: string;
  quantity: number | string;
  canonical_unit: string;
  is_active: boolean;
}
interface RawComponent {
  id: string;
  component_group: Database["public"]["Enums"]["provider_component_group"];
  default_catalog_item_id: string;
  default_quantity: number | string;
  canonical_unit: string;
  is_required: boolean;
  supports_spice_level: boolean;
  supports_salt_level: boolean;
  sort_order: number;
  alternatives: RawAlternative[] | null;
  customization_groups: RawGroup[] | null;
}
interface RawMenuDay {
  id: string;
  provider_id: string;
  weekly_menu_id: string;
  menu_date: string;
  cutoff_at: string;
  status: Database["public"]["Enums"]["provider_menu_status"];
  note: string | null;
  published_at: string | null;
  locked_at: string | null;
  components: RawComponent[] | null;
}

/** Ascending `sort_order` comparator (stable plate order). */
function bySortOrder(
  a: { sort_order: number },
  b: { sort_order: number },
): number {
  return a.sort_order - b.sort_order;
}

function toCustomizationGroupDto(group: RawGroup): CustomizationGroupDto {
  return {
    customizationGroupId: group.id,
    name: group.name,
    customizationType: group.customization_type,
    includedInPrice: group.included_in_price,
    isRequired: group.is_required,
    minimumSelections: group.minimum_selections,
    maximumSelections: group.maximum_selections,
    options: (group.options ?? [])
      .filter((option) => option.is_active)
      .sort(bySortOrder)
      .map((option) => ({
        optionId: option.id,
        code: option.code,
        label: option.label,
        quantityDelta: numOrNull(option.quantity_delta),
        externalPriceLabel: option.external_price_label,
        minimumQuantity: numOrNull(option.minimum_quantity),
        maximumQuantity: numOrNull(option.maximum_quantity),
      })),
  };
}

function toMenuComponentDto(component: RawComponent): MenuComponentDto {
  return {
    menuComponentId: component.id,
    componentGroup: component.component_group,
    defaultCatalogItemId: component.default_catalog_item_id,
    defaultQuantity: Number(component.default_quantity),
    canonicalUnit: component.canonical_unit,
    isRequired: component.is_required,
    sortOrder: component.sort_order,
    supportsSpiceLevel: component.supports_spice_level,
    supportsSaltLevel: component.supports_salt_level,
    // Archived (is_active=false) alternatives are kept for history but never shown.
    alternatives: (component.alternatives ?? [])
      .filter((alternative) => alternative.is_active)
      .map((alternative) => ({
        alternativeId: alternative.id,
        catalogItemId: alternative.catalog_item_id,
        quantity: Number(alternative.quantity),
        canonicalUnit: alternative.canonical_unit,
      })),
    customizationGroups: (component.customization_groups ?? [])
      .sort(bySortOrder)
      .map(toCustomizationGroupDto),
  };
}

/** Map a menu-day projection row to its wire DTO (snake_case → camelCase). */
function toMenuDayDto(row: RawMenuDay): MenuDayDto {
  return {
    menuDayId: row.id,
    providerId: row.provider_id,
    weeklyMenuId: row.weekly_menu_id,
    menuDate: row.menu_date,
    cutoffAt: row.cutoff_at,
    status: row.status,
    note: row.note,
    publishedAt: row.published_at,
    lockedAt: row.locked_at,
    components: (row.components ?? [])
      .sort(bySortOrder)
      .map(toMenuComponentDto),
  };
}

/** `YYYY-MM-DD` for `now` in `timeZone` (en-CA renders ISO date order). */
function dateInTimeZone(now: Date, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(now);
  } catch {
    // A provider tz is IANA-validated at onboarding; fall back to UTC defensively
    // so a corrupt value can never turn a read into a 500.
    return now.toISOString().slice(0, 10);
  }
}

/** Add `days` to a `YYYY-MM-DD` date (UTC math, no tz drift). */
function addDays(ymd: string, days: number): string {
  const parts = ymd.split("-");
  const year = Number(parts[0]);
  const month = Number(parts[1]);
  const day = Number(parts[2]);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/**
 * "Today" (YYYY-MM-DD) in the provider's timezone. Reads the provider's tz via
 * RLS `porg_select` (any live member); an unknown provider 404s — consistent with
 * the menu reads, never leaking existence.
 */
async function providerToday(
  supabase: SupabaseClient,
  providerId: string,
): Promise<string> {
  const { data, error } = await supabase
    .from("provider_organizations")
    .select("timezone")
    .eq("id", providerId)
    .maybeSingle();
  if (error) mapReadError(error, "Failed to resolve the provider timezone.");
  if (!data) throw new NotFoundError("Provider not found.");
  return dateInTimeZone(new Date(), data.timezone);
}

/**
 * `GET /api/provider-menu-days/{menuDayId}` — one day with its full component
 * tree. RLS gates visibility; an unreadable or unknown id is an existence-hiding
 * 404.
 */
export async function getMenuDay(menuDayId: string): Promise<MenuDayDto> {
  await requireAuthUser();
  if (!isUuid(menuDayId)) throw new NotFoundError("Menu not found.");
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("provider_menu_days")
    .select(MENU_DAY_SELECT)
    .eq("id", menuDayId)
    .maybeSingle();
  if (error) mapReadError(error, "Failed to load the menu.");
  if (!data) throw new NotFoundError("Menu not found.");
  return toMenuDayDto(data as unknown as RawMenuDay);
}

/**
 * `GET /api/providers/{providerId}/today-menu` — the menu day for today in the
 * provider's timezone, or `null` when none is readable (no published day today,
 * or the caller is not yet an approved customer). If more than one day shares the
 * date (the unique (provider_id, menu_date) index is deferred to ADR-7), the most
 * recently published wins, with a stable created_at-then-id tiebreaker so two
 * un-published drafts can never resolve nondeterministically across requests.
 */
export async function getTodayMenu(
  providerId: string,
): Promise<MenuDayDto | null> {
  await requireAuthUser();
  if (!isUuid(providerId)) throw new NotFoundError("Provider not found.");
  const supabase = await createServerSupabaseClient();
  const today = await providerToday(supabase, providerId);
  const { data, error } = await supabase
    .from("provider_menu_days")
    .select(MENU_DAY_SELECT)
    .eq("provider_id", providerId)
    .eq("menu_date", today)
    .order("published_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .order("id", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) mapReadError(error, "Failed to load the menu.");
  return data ? toMenuDayDto(data as unknown as RawMenuDay) : null;
}

/**
 * `GET /api/providers/{providerId}/weekly-menu` — the readable menu days in the
 * 7-day window [today, today+6] in the provider's timezone, ascending by date.
 * RLS filters each day by the caller's role (owner: any status; customer:
 * published/locked), so a customer's list naturally omits drafts.
 */
export async function getWeeklyMenu(providerId: string): Promise<MenuDayDto[]> {
  await requireAuthUser();
  if (!isUuid(providerId)) throw new NotFoundError("Provider not found.");
  const supabase = await createServerSupabaseClient();
  const today = await providerToday(supabase, providerId);
  const weekEnd = addDays(today, 6);
  const { data, error } = await supabase
    .from("provider_menu_days")
    .select(MENU_DAY_SELECT)
    .eq("provider_id", providerId)
    .gte("menu_date", today)
    .lte("menu_date", weekEnd)
    .order("menu_date", { ascending: true });
  if (error) mapReadError(error, "Failed to load the menu.");
  return ((data ?? []) as unknown as RawMenuDay[]).map(toMenuDayDto);
}
