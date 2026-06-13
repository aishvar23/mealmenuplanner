import "server-only";

import { requireAuthUser } from "@/lib/auth";
import type { Database } from "@/lib/db/database.types";
import { createServerSupabaseClient } from "@/lib/db/server";
import {
  InternalError,
  NotFoundError,
  UnauthenticatedError,
  ValidationError,
} from "@/lib/errors";
import type { JsonObject } from "@/lib/http";
import { isUuid } from "@/lib/validation/uuid";
import type { CatalogItemDto } from "@/packages/shared/provider";

import {
  validateCreateCatalogItem,
  validateUpdateCatalogItem,
} from "./catalog-validation";

/**
 * Provider catalog service (MP-A-110, contract 03 § 8). The owner-authored item
 * library every menu component draws from.
 *
 *   • `listProviderCatalog` — `GET /api/providers/{id}/catalog`; the owner's full
 *     library, grouped by component (active items still listed — archived ones too,
 *     so the owner can restore them).
 *   • `createCatalogItem` — `POST .../catalog`; insert through RLS `pcat_insert`
 *     (owner only). `provider_id` comes from the route, never the client (plan § 9).
 *   • `updateCatalogItem` — `PATCH .../catalog/{itemId}`; partial edit OR archive/
 *     restore (toggle `is_active`) through RLS `pcat_update`. Items are never hard
 *     deleted (ADR-4) — past menus/responses keep their referenced item.
 *
 * Every path gates ownership up front via {@link requireProviderOwner} so a
 * non-owner (or an unknown/malformed provider id) gets the same existence-hiding
 * `NotFoundError` on a read as on a write — uniform with the members read
 * (design/04 § 2/§ 4), rather than a read leaking an empty 200. RLS remains the
 * authoritative backstop underneath. The owner membership is `active` even while
 * the org is still a `draft` (`create_provider_draft` mints it atomically), so
 * `is_provider_owner` is true during onboarding — the onboarding wizard's catalog
 * seed (MP-B-020/MP-C-020) writes through these same paths. Route handlers stay
 * thin: parse, call one of these, serialize. camelCase↔snake_case translation
 * lives here at the boundary.
 */

type SupabaseClient = Awaited<ReturnType<typeof createServerSupabaseClient>>;
type CatalogRow = Database["public"]["Tables"]["provider_catalog_items"]["Row"];

/**
 * Draft-safe owner gate. Unlike `requireOwnedProvider` (which lists workspace
 * summaries and excludes `draft` orgs), this calls the SECURITY DEFINER
 * `is_provider_owner(p)` — true for the owner even while the org is a draft
 * (onboarding) — so a non-owner, or an unknown/malformed provider id, is answered
 * with an existence-hiding `NotFoundError` (design/04 § 2). A non-UUID id can't
 * name a real row, so it short-circuits without a round trip (and avoids a `22P02`
 * cast error surfacing as a 500).
 */
async function requireProviderOwner(
  supabase: SupabaseClient,
  providerId: string,
): Promise<void> {
  if (!isUuid(providerId)) throw new NotFoundError("Provider not found.");
  const { data, error } = await supabase.rpc("is_provider_owner", {
    p: providerId,
  });
  if (error) {
    if (error.code === "28000") throw new UnauthenticatedError();
    throw new InternalError("Failed to verify provider ownership.", {
      cause: error,
    });
  }
  if (!data) throw new NotFoundError("Provider not found.");
}

/** The catalog columns the DTO needs — selected explicitly, never `*`. */
const CATALOG_COLUMNS =
  "id, name, component_group, canonical_unit, default_quantity, image_url, is_active, supports_spice_level, supports_salt_level, allergy_warning, source_dish_id";

/** Map a `provider_catalog_items` row to its wire DTO (snake_case → camelCase). */
function toCatalogItemDto(row: CatalogRow): CatalogItemDto {
  return {
    catalogItemId: row.id,
    name: row.name,
    componentGroup: row.component_group,
    canonicalUnit: row.canonical_unit,
    // `numeric` can arrive as a string via PostgREST; coerce so the DTO is a number.
    defaultQuantity: Number(row.default_quantity),
    imageUrl: row.image_url,
    isActive: row.is_active,
    supportsSpiceLevel: row.supports_spice_level,
    supportsSaltLevel: row.supports_salt_level,
    allergyWarning: row.allergy_warning,
    sourceDishId: row.source_dish_id,
  };
}

/**
 * The table's CHECK constraints (migration `pmp_3_catalog`), mapped to the request
 * field + rule they back, so a `23514` is attributed to the column that actually
 * failed instead of always blaming `defaultQuantity`. Ownership is gated before
 * every write, so these are defense-in-depth behind the validator.
 */
const CHECK_CONSTRAINT_ISSUES: Record<string, { field: string; rule: string }> =
  {
    provider_catalog_name_not_blank: { field: "name", rule: "required" },
    provider_catalog_unit_not_blank: {
      field: "canonicalUnit",
      rule: "required",
    },
    provider_catalog_default_quantity_positive: {
      field: "defaultQuantity",
      rule: "positive",
    },
  };

/**
 * Map a write error to a domain error. `42501` (RLS rejection → caller is not the
 * provider owner) becomes an existence-hiding `NotFoundError`; a `23503` FK
 * violation on `source_dish_id` becomes a field `ValidationError`; `23514` (a DB
 * CHECK) is attributed to the violated constraint's field; `22003` (numeric
 * overflow) to `defaultQuantity`.
 */
function mapWriteError(error: {
  code?: string;
  message?: string;
  cause?: unknown;
}): never {
  if (error.code === "28000") throw new UnauthenticatedError();
  if (error.code === "42501") throw new NotFoundError("Provider not found.");
  if (error.code === "23503") {
    throw new ValidationError("That source dish does not exist.", [
      { field: "sourceDishId", rule: "exists" },
    ]);
  }
  if (error.code === "23514") {
    const message = error.message ?? "";
    const matched = Object.entries(CHECK_CONSTRAINT_ISSUES).find(([name]) =>
      message.includes(name),
    );
    const issue = matched?.[1] ?? {
      field: "defaultQuantity",
      rule: "positive",
    };
    throw new ValidationError("Some catalog item details are invalid.", [
      issue,
    ]);
  }
  if (error.code === "22003") {
    throw new ValidationError("Some catalog item details are invalid.", [
      { field: "defaultQuantity", rule: "max" },
    ]);
  }
  throw new InternalError("Failed to save the catalog item.", { cause: error });
}

/**
 * `GET /api/providers/{id}/catalog` — the owner's catalog, ordered by component
 * group (natural plate order, the enum's definition order) then name, so the read
 * is effectively grouped. Owner-gated up front, then owner-scoped by RLS; a
 * non-owner gets an existence-hiding `NotFoundError`.
 */
export async function listProviderCatalog(
  providerId: string,
): Promise<CatalogItemDto[]> {
  await requireAuthUser();
  const supabase = await createServerSupabaseClient();
  await requireProviderOwner(supabase, providerId);
  const { data, error } = await supabase
    .from("provider_catalog_items")
    .select(CATALOG_COLUMNS)
    .eq("provider_id", providerId)
    .order("component_group", { ascending: true })
    .order("name", { ascending: true });
  if (error) {
    throw new InternalError("Failed to load the catalog.", { cause: error });
  }
  return (data ?? []).map((row) => toCatalogItemDto(row as CatalogRow));
}

/**
 * `POST /api/providers/{id}/catalog` — add one item (owner only). Ownership is
 * gated first (a non-owner gets an existence-hiding `NotFoundError`), then the
 * body is validated and inserted with the route's `provider_id`; RLS backstops.
 */
export async function createCatalogItem(
  providerId: string,
  body: JsonObject,
): Promise<CatalogItemDto> {
  await requireAuthUser();
  const supabase = await createServerSupabaseClient();
  await requireProviderOwner(supabase, providerId);
  const values = validateCreateCatalogItem(body);
  const { data, error } = await supabase
    .from("provider_catalog_items")
    .insert({ ...values, provider_id: providerId })
    .select(CATALOG_COLUMNS)
    .single();
  if (error) mapWriteError(error);
  return toCatalogItemDto(data as CatalogRow);
}

/**
 * `PATCH /api/providers/{id}/catalog/{itemId}` — partial edit or archive/restore
 * (toggle `is_active`). An empty patch is a no-op that re-reads the current item.
 * A row the caller can't update (not owner, or absent) surfaces as `NotFoundError`
 * — we never distinguish "forbidden" from "absent" (design/04 § 2). Scoped by both
 * the item id and `provider_id` so an item can't be edited under the wrong path.
 */
export async function updateCatalogItem(
  providerId: string,
  catalogItemId: string,
  body: JsonObject,
): Promise<CatalogItemDto> {
  await requireAuthUser();
  const supabase = await createServerSupabaseClient();
  await requireProviderOwner(supabase, providerId);
  const patch = validateUpdateCatalogItem(body);

  if (Object.keys(patch).length === 0) {
    return readCatalogItem(supabase, providerId, catalogItemId);
  }

  const { data, error } = await supabase
    .from("provider_catalog_items")
    .update(patch)
    .eq("id", catalogItemId)
    .eq("provider_id", providerId)
    .select(CATALOG_COLUMNS)
    .maybeSingle();
  if (error) mapWriteError(error);
  if (!data) throw new NotFoundError("Catalog item not found.");
  return toCatalogItemDto(data as CatalogRow);
}

/** Read one item by id within a provider (RLS owner-scoped); 404 when absent. */
async function readCatalogItem(
  supabase: SupabaseClient,
  providerId: string,
  catalogItemId: string,
): Promise<CatalogItemDto> {
  const { data, error } = await supabase
    .from("provider_catalog_items")
    .select(CATALOG_COLUMNS)
    .eq("id", catalogItemId)
    .eq("provider_id", providerId)
    .maybeSingle();
  if (error) {
    throw new InternalError("Failed to load the catalog item.", {
      cause: error,
    });
  }
  if (!data) throw new NotFoundError("Catalog item not found.");
  return toCatalogItemDto(data as CatalogRow);
}
