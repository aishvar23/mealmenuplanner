// Provider catalog management form model (ADO #88) — the pure, shared state +
// validation behind the owner's self-service catalog UI (web + mobile). No
// `server-only` / `next/*` / I/O, so the web manager and the mobile screen drive the
// identical add/edit form and the identical client-side gate, and both unit-test in
// isolation. The server validators (`validateCreateCatalogItem` /
// `validateUpdateCatalogItem`, MP-A-110) plus the DB CHECK/NOT-NULL constraints stay
// the authoritative backstop — this just turns the obvious bad input into a clean
// inline message before the request and produces the camelCase wire request.

import type {
  CatalogItemDto,
  CreateCatalogItemRequest,
  UpdateCatalogItemRequest,
} from "./dtos";
import type { ProviderComponentGroup } from "./enums";
import { PROVIDER_COMPONENT_GROUP_OPTIONS } from "./labels";

/**
 * Field bounds mirrored from the server validator
 * (`lib/services/provider/catalog-validation.ts`) + the `numeric(10,3)`
 * `default_quantity` column, so the client gate matches what the server accepts and
 * can't silently drift. The server remains authoritative.
 */
export const CATALOG_NAME_MAX = 120;
export const CATALOG_UNIT_MAX = 40;
export const CATALOG_ALLERGY_MAX = 200;
export const CATALOG_IMAGE_URL_MAX = 2048;
export const CATALOG_QUANTITY_MAX = 9_999_999.999;
export const CATALOG_QUANTITY_SCALE = 3;

/**
 * The catalog add/edit form's working state. `defaultQuantity` is kept as raw text
 * (a partially-typed / empty field is `""`, never a bogus `0`) and parsed on submit;
 * `imageUrl` / `allergyWarning` are plain strings that map to `null` when blank.
 */
export interface CatalogFormState {
  name: string;
  componentGroup: ProviderComponentGroup;
  canonicalUnit: string;
  defaultQuantity: string;
  imageUrl: string;
  allergyWarning: string;
  supportsSpiceLevel: boolean;
  supportsSaltLevel: boolean;
}

/** Per-field, human-readable issues; an empty object means the form is submittable. */
export interface CatalogFormIssues {
  name?: string;
  canonicalUnit?: string;
  defaultQuantity?: string;
  imageUrl?: string;
  allergyWarning?: string;
}

/** A blank add form, defaulted to the first component group (natural plate order). */
export function emptyCatalogForm(): CatalogFormState {
  return {
    name: "",
    componentGroup: PROVIDER_COMPONENT_GROUP_OPTIONS[0]!.value,
    canonicalUnit: "",
    defaultQuantity: "",
    imageUrl: "",
    allergyWarning: "",
    supportsSpiceLevel: false,
    supportsSaltLevel: false,
  };
}

/** Hydrate the edit form from an existing catalog item (nullable fields → ""). */
export function catalogFormFromItem(item: CatalogItemDto): CatalogFormState {
  return {
    name: item.name,
    componentGroup: item.componentGroup,
    canonicalUnit: item.canonicalUnit,
    defaultQuantity: String(item.defaultQuantity),
    imageUrl: item.imageUrl ?? "",
    allergyWarning: item.allergyWarning ?? "",
    supportsSpiceLevel: item.supportsSpiceLevel,
    supportsSaltLevel: item.supportsSaltLevel,
  };
}

/**
 * Parse the raw quantity text to a number, or `null` when empty / non-numeric. Kept
 * separate so the form can both validate and serialize off one parse.
 */
export function parseCatalogQuantity(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  const value = Number(trimmed);
  return Number.isFinite(value) ? value : null;
}

/**
 * True if `value` carries more than {@link CATALOG_QUANTITY_SCALE} decimals (or is in
 * scientific notation) — a precision the `numeric(10,3)` column can't hold without
 * silently rounding. Mirrors the server's `exceedsQuantityScale`.
 */
function exceedsQuantityScale(value: number): boolean {
  const s = value.toString();
  if (s.includes("e") || s.includes("E")) return true;
  const dot = s.indexOf(".");
  return dot !== -1 && s.length - dot - 1 > CATALOG_QUANTITY_SCALE;
}

/** Validate a non-empty image URL: must parse and be `http(s)` (never `javascript:`/`data:`). */
function imageUrlIssue(raw: string): string | undefined {
  const trimmed = raw.trim();
  if (trimmed === "") return undefined;
  if (trimmed.length > CATALOG_IMAGE_URL_MAX) return "Image URL is too long.";
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return "Enter a valid http(s) image URL.";
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return "Enter a valid http(s) image URL.";
  }
  return undefined;
}

/**
 * The current form's field issues, mirroring the server's create/update rules so the
 * owner sees the same constraints inline before submitting. An empty result means
 * the form is submittable; the server (and DB CHECKs) remain the final backstop.
 */
export function catalogFormIssues(state: CatalogFormState): CatalogFormIssues {
  const issues: CatalogFormIssues = {};

  const name = state.name.trim();
  if (name === "") issues.name = "Enter a dish name.";
  else if (name.length > CATALOG_NAME_MAX)
    issues.name = `Keep the name under ${CATALOG_NAME_MAX} characters.`;

  const unit = state.canonicalUnit.trim();
  if (unit === "") issues.canonicalUnit = "Enter a unit (e.g. oz, piece).";
  else if (unit.length > CATALOG_UNIT_MAX)
    issues.canonicalUnit = `Keep the unit under ${CATALOG_UNIT_MAX} characters.`;

  const qty = parseCatalogQuantity(state.defaultQuantity);
  if (qty === null || qty <= 0)
    issues.defaultQuantity = "Enter a quantity greater than 0.";
  else if (qty > CATALOG_QUANTITY_MAX)
    issues.defaultQuantity = "Quantity is too large.";
  else if (exceedsQuantityScale(qty))
    issues.defaultQuantity = `Use at most ${CATALOG_QUANTITY_SCALE} decimal places.`;

  const image = imageUrlIssue(state.imageUrl);
  if (image) issues.imageUrl = image;

  if (state.allergyWarning.trim().length > CATALOG_ALLERGY_MAX)
    issues.allergyWarning = `Keep the allergy note under ${CATALOG_ALLERGY_MAX} characters.`;

  return issues;
}

/** Whether the form passes the client-side gate (no field issues). */
export function isCatalogFormValid(state: CatalogFormState): boolean {
  return Object.keys(catalogFormIssues(state)).length === 0;
}

/** Serialize the form into the `POST .../catalog` request (blank optionals → null). */
export function catalogFormToCreateRequest(
  state: CatalogFormState,
): CreateCatalogItemRequest {
  return {
    name: state.name.trim(),
    componentGroup: state.componentGroup,
    canonicalUnit: state.canonicalUnit.trim(),
    defaultQuantity: parseCatalogQuantity(state.defaultQuantity) ?? 0,
    imageUrl: state.imageUrl.trim() || null,
    allergyWarning: state.allergyWarning.trim() || null,
    supportsSpiceLevel: state.supportsSpiceLevel,
    supportsSaltLevel: state.supportsSaltLevel,
  };
}

/**
 * Serialize the form into the `PATCH .../catalog/{id}` request. A full-form edit
 * sends every editable field (the partial PATCH simply writes them all); archiving is
 * a separate `{ isActive: false }` call, so it's never part of the edit body.
 */
export function catalogFormToUpdateRequest(
  state: CatalogFormState,
): UpdateCatalogItemRequest {
  return catalogFormToCreateRequest(state);
}

/** One component group's catalog items, with its display label, for a grouped list. */
export interface CatalogGroup {
  group: ProviderComponentGroup;
  label: string;
  items: CatalogItemDto[];
}

/**
 * Group a flat catalog list by component group in natural plate order (main → dal →
 * sabzi → bread → rice → side → add-on), dropping empty groups. Preserves the input
 * order within each group (the service already orders by group then name).
 */
export function groupCatalogByComponent(
  items: readonly CatalogItemDto[],
): CatalogGroup[] {
  return PROVIDER_COMPONENT_GROUP_OPTIONS.map(({ value, label }) => ({
    group: value,
    label,
    items: items.filter((item) => item.componentGroup === value),
  })).filter((group) => group.items.length > 0);
}
