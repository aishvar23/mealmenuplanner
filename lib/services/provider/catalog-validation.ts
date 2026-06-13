import { ValidationError, type ValidationIssue } from "@/lib/errors";
import type { JsonObject } from "@/lib/http";
import { isUuid } from "@/lib/validation/uuid";
import {
  PROVIDER_COMPONENT_GROUPS,
  type ProviderComponentGroup,
} from "@/packages/shared/provider";

import { optionalText, requiredText } from "./text-validators";

// Re-exported for the service barrel (`./index`) — the canonical list lives in
// `@mmp/shared/provider` so the web/mobile pickers and this validator share one set.
export { PROVIDER_COMPONENT_GROUPS };

/**
 * Pure request validation for the provider catalog write flows (MP-A-110,
 * contract 03 § 8). No I/O / `server-only` / Supabase, so the rules unit-test in
 * isolation; the DB CHECK/NOT-NULL constraints + RLS stay the authoritative
 * backstop — this just turns bad input into a clean `ValidationError` (400) with
 * field-scoped issues instead of a Postgres error mapped to a 500.
 */

const NAME_MAX = 120;
const UNIT_MAX = 40;
const ALLERGY_MAX = 200;
const IMAGE_URL_MAX = 2048;
/**
 * Bounds coordinated with the `default_quantity numeric(10,3)` column: a value
 * with more than {@link QUANTITY_SCALE} decimals would be silently rounded by
 * Postgres (a quiet data-fidelity loss), and a value above {@link QUANTITY_MAX}
 * (the column's true capacity) would raise a `22003` overflow at insert instead
 * of a clean 400. Validating both here keeps the validator the single source of
 * truth for what the column can faithfully hold.
 */
const QUANTITY_SCALE = 3;
const QUANTITY_MAX = 9_999_999.999;

/** The catalog columns (snake_case) for a DB insert — `provider_id` is added by
 * the service from the route, never the client (plan § 9). */
export interface CatalogInsertValues {
  name: string;
  component_group: ProviderComponentGroup;
  canonical_unit: string;
  default_quantity: number;
  image_url: string | null;
  supports_spice_level: boolean;
  supports_salt_level: boolean;
  allergy_warning: string | null;
  source_dish_id: string | null;
}

/** A partial catalog update (only present keys are written); `is_active` archives. */
export type CatalogUpdatePatch = Partial<CatalogInsertValues> & {
  is_active?: boolean;
};

/**
 * A nullable image URL: same trim/blank/length rules as {@link optionalText},
 * plus an `http(s)`-only scheme check so an unsafe value (e.g. `javascript:` or a
 * `data:` URI) can't be stored and later bound into an `<img src>` / link by the
 * web/mobile UI. Pushes a `url` issue (and returns `undefined`) on a malformed or
 * non-`http(s)` URL.
 */
function optionalImageUrl(
  value: unknown,
  field: string,
  issues: ValidationIssue[],
): string | null | undefined {
  const text = optionalText(value, field, issues, IMAGE_URL_MAX);
  if (text === undefined || text === null) return text;
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    issues.push({ field, rule: "url" });
    return undefined;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    issues.push({ field, rule: "url" });
    return undefined;
  }
  return text;
}

/** Validate a component group against the shared allow-list; null + issue if bad. */
function componentGroup(
  value: unknown,
  issues: ValidationIssue[],
): ProviderComponentGroup | null {
  if (
    typeof value !== "string" ||
    !PROVIDER_COMPONENT_GROUPS.includes(value as ProviderComponentGroup)
  ) {
    issues.push({
      field: "componentGroup",
      rule: "enum",
      allowed: PROVIDER_COMPONENT_GROUPS,
    });
    return null;
  }
  return value as ProviderComponentGroup;
}

/**
 * True if `value` carries more than {@link QUANTITY_SCALE} decimal places (or is
 * expressed in scientific notation, which only arises outside the normal quantity
 * range) — i.e. a precision the `numeric(10,3)` column can't hold without silently
 * rounding. Uses the number's canonical string form to avoid float-multiply error.
 */
function exceedsQuantityScale(value: number): boolean {
  const s = value.toString();
  if (s.includes("e") || s.includes("E")) return true;
  const dot = s.indexOf(".");
  return dot !== -1 && s.length - dot - 1 > QUANTITY_SCALE;
}

/**
 * Validate a positive, finite default quantity within the bounds and precision the
 * `numeric(10,3)` column can faithfully store; null + issue if bad.
 */
function defaultQuantity(
  value: unknown,
  issues: ValidationIssue[],
): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    issues.push({ field: "defaultQuantity", rule: "positive" });
    return null;
  }
  if (value > QUANTITY_MAX) {
    issues.push({ field: "defaultQuantity", rule: "max", max: QUANTITY_MAX });
    return null;
  }
  if (exceedsQuantityScale(value)) {
    issues.push({
      field: "defaultQuantity",
      rule: "scale",
      scale: QUANTITY_SCALE,
    });
    return null;
  }
  return value;
}

/** An optional boolean flag defaulting to `false`; pushes an issue on a non-boolean. */
function optionalBool(
  value: unknown,
  field: string,
  issues: ValidationIssue[],
): boolean {
  if (value === undefined || value === null) return false;
  if (typeof value !== "boolean") {
    issues.push({ field, rule: "type" });
    return false;
  }
  return value;
}

/** Validate an optional nullable UUID (the `sourceDishId` soft link). */
function optionalUuid(
  value: unknown,
  field: string,
  issues: ValidationIssue[],
): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== "string" || !isUuid(value)) {
    issues.push({ field, rule: "uuid" });
    return undefined;
  }
  return value;
}

/**
 * Validate + normalize the create-catalog-item body into DB column values. All
 * required fields must be present and valid; optional flags default false and
 * nullable fields default null. Throws `ValidationError` aggregating every issue.
 */
export function validateCreateCatalogItem(
  body: JsonObject,
): CatalogInsertValues {
  const issues: ValidationIssue[] = [];

  const name = requiredText(body.name, "name", NAME_MAX, issues);
  const group = componentGroup(body.componentGroup, issues);
  const unit = requiredText(
    body.canonicalUnit,
    "canonicalUnit",
    UNIT_MAX,
    issues,
  );
  const qty = defaultQuantity(body.defaultQuantity, issues);
  const imageUrl = optionalImageUrl(body.imageUrl, "imageUrl", issues);
  const allergy = optionalText(
    body.allergyWarning,
    "allergyWarning",
    issues,
    ALLERGY_MAX,
  );
  const sourceDishId = optionalUuid(body.sourceDishId, "sourceDishId", issues);
  const supportsSpice = optionalBool(
    body.supportsSpiceLevel,
    "supportsSpiceLevel",
    issues,
  );
  const supportsSalt = optionalBool(
    body.supportsSaltLevel,
    "supportsSaltLevel",
    issues,
  );

  if (issues.length > 0) {
    throw new ValidationError("Some catalog item details are invalid.", issues);
  }

  return {
    name: name as string,
    component_group: group as ProviderComponentGroup,
    canonical_unit: unit as string,
    default_quantity: qty as number,
    image_url: imageUrl ?? null,
    supports_spice_level: supportsSpice,
    supports_salt_level: supportsSalt,
    allergy_warning: allergy ?? null,
    source_dish_id: sourceDishId ?? null,
  };
}

/**
 * Validate + normalize a partial catalog-item update into the DB column shape.
 * Only the keys present on `body` are returned, so a PATCH touches just those
 * columns; an empty patch is allowed (the service treats it as a no-op read-back).
 * Throws `ValidationError` aggregating every field issue.
 */
export function validateUpdateCatalogItem(
  body: JsonObject,
): CatalogUpdatePatch {
  const issues: ValidationIssue[] = [];
  const patch: CatalogUpdatePatch = {};

  if (body.name !== undefined) {
    const name = requiredText(body.name, "name", NAME_MAX, issues);
    if (name !== null) patch.name = name;
  }
  if (body.componentGroup !== undefined) {
    const group = componentGroup(body.componentGroup, issues);
    if (group !== null) patch.component_group = group;
  }
  if (body.canonicalUnit !== undefined) {
    const unit = requiredText(
      body.canonicalUnit,
      "canonicalUnit",
      UNIT_MAX,
      issues,
    );
    if (unit !== null) patch.canonical_unit = unit;
  }
  if (body.defaultQuantity !== undefined) {
    const qty = defaultQuantity(body.defaultQuantity, issues);
    if (qty !== null) patch.default_quantity = qty;
  }

  const imageUrl = optionalImageUrl(body.imageUrl, "imageUrl", issues);
  if (imageUrl !== undefined) patch.image_url = imageUrl;
  const allergy = optionalText(
    body.allergyWarning,
    "allergyWarning",
    issues,
    ALLERGY_MAX,
  );
  if (allergy !== undefined) patch.allergy_warning = allergy;
  const sourceDishId = optionalUuid(body.sourceDishId, "sourceDishId", issues);
  if (sourceDishId !== undefined) patch.source_dish_id = sourceDishId;

  if (body.supportsSpiceLevel !== undefined) {
    if (typeof body.supportsSpiceLevel !== "boolean") {
      issues.push({ field: "supportsSpiceLevel", rule: "type" });
    } else {
      patch.supports_spice_level = body.supportsSpiceLevel;
    }
  }
  if (body.supportsSaltLevel !== undefined) {
    if (typeof body.supportsSaltLevel !== "boolean") {
      issues.push({ field: "supportsSaltLevel", rule: "type" });
    } else {
      patch.supports_salt_level = body.supportsSaltLevel;
    }
  }
  if (body.isActive !== undefined) {
    if (typeof body.isActive !== "boolean") {
      issues.push({ field: "isActive", rule: "type" });
    } else {
      patch.is_active = body.isActive;
    }
  }

  if (issues.length > 0) {
    throw new ValidationError("Some catalog item details are invalid.", issues);
  }
  return patch;
}
