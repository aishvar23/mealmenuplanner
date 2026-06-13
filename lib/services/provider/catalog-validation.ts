import { ValidationError, type ValidationIssue } from "@/lib/errors";
import type { JsonObject } from "@/lib/http";
import {
  PROVIDER_COMPONENT_GROUPS,
  type ProviderComponentGroup,
} from "@/packages/shared/provider";

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
/** A sane upper bound on a per-portion default quantity (the DB only checks > 0). */
const QUANTITY_MAX = 1_000_000;

/** RFC-4122 UUID (any version), for the optional `sourceDishId` soft link. */
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

/** A trimmed, bounded required string; pushes an issue and returns null if invalid. */
function requiredText(
  value: unknown,
  field: string,
  max: number,
  issues: ValidationIssue[],
): string | null {
  if (typeof value !== "string" || value.trim().length === 0) {
    issues.push({ field, rule: "required" });
    return null;
  }
  const trimmed = value.trim();
  if (trimmed.length > max) {
    issues.push({ field, rule: "maxLength", max });
    return null;
  }
  return trimmed;
}

/**
 * A nullable free-text field: `undefined` → omitted (returns `undefined`), `null`
 * or blank → `null`, otherwise a trimmed/bounded string. Pushes an issue (and
 * returns `undefined`) on a non-string or over-length value.
 */
function optionalText(
  value: unknown,
  field: string,
  max: number,
  issues: ValidationIssue[],
): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== "string") {
    issues.push({ field, rule: "type" });
    return undefined;
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  if (trimmed.length > max) {
    issues.push({ field, rule: "maxLength", max });
    return undefined;
  }
  return trimmed;
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

/** Validate a positive, finite default quantity; null + issue if bad. */
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
  if (typeof value !== "string" || !UUID_RE.test(value)) {
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
  const imageUrl = optionalText(
    body.imageUrl,
    "imageUrl",
    IMAGE_URL_MAX,
    issues,
  );
  const allergy = optionalText(
    body.allergyWarning,
    "allergyWarning",
    ALLERGY_MAX,
    issues,
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

  const imageUrl = optionalText(
    body.imageUrl,
    "imageUrl",
    IMAGE_URL_MAX,
    issues,
  );
  if (imageUrl !== undefined) patch.image_url = imageUrl;
  const allergy = optionalText(
    body.allergyWarning,
    "allergyWarning",
    ALLERGY_MAX,
    issues,
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
