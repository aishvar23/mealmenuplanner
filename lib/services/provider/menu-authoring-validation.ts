import { ValidationError, type ValidationIssue } from "@/lib/errors";
import type { JsonObject } from "@/lib/http";
import {
  PROVIDER_COMPONENT_GROUPS,
  PROVIDER_CUSTOMIZATION_TYPES,
  type ProviderComponentGroup,
  type ProviderCustomizationType,
} from "@/packages/shared/provider";

import {
  QUANTITY_MAX,
  QUANTITY_SCALE,
  exceedsQuantityScale,
  requiredUuid,
} from "./field-validators";
import { optionalText, requiredText } from "./text-validators";

/**
 * Pure request validation for the menu-day AUTHORING write flow (MP-A-121, contract
 * 03 § 5/§ 8). No I/O / `server-only` / Supabase, so the rules unit-test in
 * isolation; the DB CHECK/NOT-NULL constraints + RLS + the `create_provider_menu_day`
 * RPC's owner/catalog gates stay the authoritative backstop — this just turns bad
 * input into a clean `ValidationError` (400) with field-scoped issues instead of a
 * Postgres error mapped to a 500.
 *
 * The output is the CAMEL-CASE payload the SECURITY DEFINER RPC reads with `->>`
 * (mirroring `save_provider_response`'s `p_items`): the builder sends only catalog
 * item IDS + structure, and the RPC denormalizes every display field off the
 * owner-private catalog. So the validator never touches names/quantities/units — it
 * checks the shape, enums, ids, selection counts, and quantity precision.
 */

const NOTE_MAX = 500;
const NAME_MAX = 120;
const UNIT_MAX = 40;
const CODE_MAX = 60;
const LABEL_MAX = 120;
const PRICE_LABEL_MAX = 60;
const MAX_COMPONENTS = 30;
const MAX_ALTERNATIVES = 30;
const MAX_GROUPS = 20;
const MAX_OPTIONS = 30;
const SELECTION_MAX = 99;

/** The normalized customization option in the RPC payload (camelCase). */
export interface NormalizedMenuOption {
  code: string;
  label: string;
  quantityDelta: number | null;
  canonicalUnit: string | null;
  externalPriceLabel: string | null;
  minimumQuantity: number | null;
  maximumQuantity: number | null;
  sortOrder: number;
}

/** The normalized customization group in the RPC payload (camelCase). */
export interface NormalizedMenuCustomizationGroup {
  name: string;
  customizationType: ProviderCustomizationType;
  includedInPrice: boolean;
  isRequired: boolean;
  minimumSelections: number;
  maximumSelections: number | null;
  sortOrder: number;
  options: NormalizedMenuOption[];
}

/** The normalized component in the RPC payload (camelCase). */
export interface NormalizedMenuComponent {
  componentGroup: ProviderComponentGroup;
  defaultCatalogItemId: string;
  isRequired: boolean;
  sortOrder: number;
  alternativeCatalogItemIds: string[];
  customizationGroups: NormalizedMenuCustomizationGroup[];
}

/** The normalized create-menu-day payload passed to `create_provider_menu_day`. */
export interface NormalizedMenuDayCreate {
  menuDate: string;
  cutoffAt: string;
  note: string | null;
  components: NormalizedMenuComponent[];
}

/** A `YYYY-MM-DD` calendar date that is a real day (round-trips through `Date`). */
function validDate(
  value: unknown,
  field: string,
  issues: ValidationIssue[],
): string | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    issues.push({ field, rule: "date" });
    return null;
  }
  const ms = Date.parse(`${value}T00:00:00Z`);
  if (Number.isNaN(ms) || new Date(ms).toISOString().slice(0, 10) !== value) {
    issues.push({ field, rule: "date" });
    return null;
  }
  return value;
}

/** A parseable ISO timestamp; normalized to its canonical ISO-8601 UTC form. */
function validTimestamp(
  value: unknown,
  field: string,
  issues: ValidationIssue[],
): string | null {
  if (typeof value !== "string") {
    issues.push({ field, rule: "datetime" });
    return null;
  }
  const ms = Date.parse(value);
  if (Number.isNaN(ms)) {
    issues.push({ field, rule: "datetime" });
    return null;
  }
  return new Date(ms).toISOString();
}

/** An optional boolean defaulting to `fallback`; pushes an issue on a non-boolean. */
function optionalBool(
  value: unknown,
  field: string,
  fallback: boolean,
  issues: ValidationIssue[],
): boolean {
  if (value === undefined || value === null) return fallback;
  if (typeof value !== "boolean") {
    issues.push({ field, rule: "type" });
    return fallback;
  }
  return value;
}

/** A non-negative integer ≤ {@link SELECTION_MAX}; `fallback` when absent. */
function selectionCount(
  value: unknown,
  field: string,
  fallback: number,
  issues: ValidationIssue[],
): number {
  if (value === undefined || value === null) return fallback;
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < 0 ||
    value > SELECTION_MAX
  ) {
    issues.push({ field, rule: "range" });
    return fallback;
  }
  return value;
}

/** An optional nullable signed quantity within the `numeric(10,3)` bounds. */
function optionalQuantity(
  value: unknown,
  field: string,
  issues: ValidationIssue[],
): number | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    issues.push({ field, rule: "number" });
    return null;
  }
  if (Math.abs(value) > QUANTITY_MAX) {
    issues.push({ field, rule: "max", max: QUANTITY_MAX });
    return null;
  }
  if (exceedsQuantityScale(value)) {
    issues.push({ field, rule: "scale", scale: QUANTITY_SCALE });
    return null;
  }
  return value;
}

/** A required enum value from `allowed`; pushes an `enum` issue if bad. */
function requiredEnum<T extends string>(
  value: unknown,
  field: string,
  allowed: readonly T[],
  issues: ValidationIssue[],
): T | null {
  if (typeof value !== "string" || !allowed.includes(value as T)) {
    issues.push({ field, rule: "enum", allowed });
    return null;
  }
  return value as T;
}

/** True if `value` is a plain (non-array) object. */
function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validateOption(
  raw: unknown,
  path: string,
  issues: ValidationIssue[],
  index: number,
): NormalizedMenuOption | null {
  if (!isObject(raw)) {
    issues.push({ field: path, rule: "type" });
    return null;
  }
  const code = requiredText(raw.code, `${path}.code`, CODE_MAX, issues);
  const label = requiredText(raw.label, `${path}.label`, LABEL_MAX, issues);
  const quantityDelta = optionalQuantity(
    raw.quantityDelta,
    `${path}.quantityDelta`,
    issues,
  );
  const canonicalUnit = optionalText(
    raw.canonicalUnit,
    `${path}.canonicalUnit`,
    issues,
    UNIT_MAX,
  );
  const externalPriceLabel = optionalText(
    raw.externalPriceLabel,
    `${path}.externalPriceLabel`,
    issues,
    PRICE_LABEL_MAX,
  );
  const minimumQuantity = optionalQuantity(
    raw.minimumQuantity,
    `${path}.minimumQuantity`,
    issues,
  );
  const maximumQuantity = optionalQuantity(
    raw.maximumQuantity,
    `${path}.maximumQuantity`,
    issues,
  );
  // Cross-field bound (mirrors the DB `provider_customization_option_qty_order` CHECK):
  // catch a reversed min/max here so it surfaces as a field-scoped 400 rather than a
  // generic 23514 the service can only label `invalid_customization`.
  if (
    minimumQuantity !== null &&
    maximumQuantity !== null &&
    minimumQuantity > maximumQuantity
  ) {
    issues.push({ field: `${path}.maximumQuantity`, rule: "range" });
  }
  if (code === null || label === null) return null;
  return {
    code,
    label,
    quantityDelta,
    canonicalUnit: canonicalUnit ?? null,
    externalPriceLabel: externalPriceLabel ?? null,
    minimumQuantity,
    maximumQuantity,
    sortOrder: index,
  };
}

function validateGroup(
  raw: unknown,
  path: string,
  issues: ValidationIssue[],
  index: number,
): NormalizedMenuCustomizationGroup | null {
  if (!isObject(raw)) {
    issues.push({ field: path, rule: "type" });
    return null;
  }
  const name = requiredText(raw.name, `${path}.name`, NAME_MAX, issues);
  const customizationType = requiredEnum(
    raw.customizationType,
    `${path}.customizationType`,
    PROVIDER_CUSTOMIZATION_TYPES,
    issues,
  );
  const includedInPrice = optionalBool(
    raw.includedInPrice,
    `${path}.includedInPrice`,
    true,
    issues,
  );
  const isRequired = optionalBool(
    raw.isRequired,
    `${path}.isRequired`,
    false,
    issues,
  );
  const minimumSelections = selectionCount(
    raw.minimumSelections,
    `${path}.minimumSelections`,
    0,
    issues,
  );
  const maximumSelections =
    raw.maximumSelections === undefined || raw.maximumSelections === null
      ? null
      : selectionCount(
          raw.maximumSelections,
          `${path}.maximumSelections`,
          0,
          issues,
        );

  const optionsRaw = raw.options;
  if (!Array.isArray(optionsRaw)) {
    issues.push({ field: `${path}.options`, rule: "array" });
    return null;
  }
  if (optionsRaw.length > MAX_OPTIONS) {
    issues.push({
      field: `${path}.options`,
      rule: "maxItems",
      max: MAX_OPTIONS,
    });
    return null;
  }
  const options: NormalizedMenuOption[] = [];
  // `code` is unique per group (DB `unique (customization_group_id, code)`); catch a
  // repeat here with the offending option's path rather than letting it trip 23505,
  // which the service can only report as a generic component-level "duplicate".
  const seenCodes = new Set<string>();
  optionsRaw.forEach((opt, i) => {
    const parsed = validateOption(opt, `${path}.options[${i}]`, issues, i);
    if (!parsed) return;
    if (seenCodes.has(parsed.code)) {
      issues.push({ field: `${path}.options[${i}].code`, rule: "duplicate" });
      return;
    }
    seenCodes.add(parsed.code);
    options.push(parsed);
  });

  if (name === null || customizationType === null) return null;
  return {
    name,
    customizationType,
    includedInPrice,
    isRequired,
    minimumSelections,
    maximumSelections,
    sortOrder: index,
    options,
  };
}

function validateComponent(
  raw: unknown,
  path: string,
  issues: ValidationIssue[],
  index: number,
): NormalizedMenuComponent | null {
  if (!isObject(raw)) {
    issues.push({ field: path, rule: "type" });
    return null;
  }
  const componentGroup = requiredEnum(
    raw.componentGroup,
    `${path}.componentGroup`,
    PROVIDER_COMPONENT_GROUPS,
    issues,
  );
  const defaultCatalogItemId = requiredUuid(
    raw.defaultCatalogItemId,
    `${path}.defaultCatalogItemId`,
    issues,
  );
  const isRequired = optionalBool(
    raw.isRequired,
    `${path}.isRequired`,
    true,
    issues,
  );

  const altsRaw = raw.alternativeCatalogItemIds;
  const alternativeCatalogItemIds: string[] = [];
  if (altsRaw !== undefined && altsRaw !== null) {
    if (!Array.isArray(altsRaw)) {
      issues.push({
        field: `${path}.alternativeCatalogItemIds`,
        rule: "array",
      });
    } else if (altsRaw.length > MAX_ALTERNATIVES) {
      issues.push({
        field: `${path}.alternativeCatalogItemIds`,
        rule: "maxItems",
        max: MAX_ALTERNATIVES,
      });
    } else {
      // De-dupe alternatives among themselves AND against the default. The DB
      // `unique (menu_component_id, catalog_item_id)` index only catches repeats
      // among alternatives — the default lives in provider_menu_components, so an
      // alternative equal to the default would otherwise slip through and render the
      // same dish as both the default and a swap. Reject both with field-scoped paths.
      const seenAlts = new Set<string>();
      altsRaw.forEach((alt, i) => {
        const id = requiredUuid(
          alt,
          `${path}.alternativeCatalogItemIds[${i}]`,
          issues,
        );
        if (id === null) return;
        if (defaultCatalogItemId !== null && id === defaultCatalogItemId) {
          issues.push({
            field: `${path}.alternativeCatalogItemIds[${i}]`,
            rule: "duplicate_default",
          });
          return;
        }
        if (seenAlts.has(id)) {
          issues.push({
            field: `${path}.alternativeCatalogItemIds[${i}]`,
            rule: "duplicate",
          });
          return;
        }
        seenAlts.add(id);
        alternativeCatalogItemIds.push(id);
      });
    }
  }

  const groupsRaw = raw.customizationGroups;
  const customizationGroups: NormalizedMenuCustomizationGroup[] = [];
  if (groupsRaw !== undefined && groupsRaw !== null) {
    if (!Array.isArray(groupsRaw)) {
      issues.push({ field: `${path}.customizationGroups`, rule: "array" });
    } else if (groupsRaw.length > MAX_GROUPS) {
      issues.push({
        field: `${path}.customizationGroups`,
        rule: "maxItems",
        max: MAX_GROUPS,
      });
    } else {
      groupsRaw.forEach((grp, i) => {
        const parsed = validateGroup(
          grp,
          `${path}.customizationGroups[${i}]`,
          issues,
          i,
        );
        if (parsed) customizationGroups.push(parsed);
      });
    }
  }

  if (componentGroup === null || defaultCatalogItemId === null) return null;
  return {
    componentGroup,
    defaultCatalogItemId,
    isRequired,
    sortOrder: index,
    alternativeCatalogItemIds,
    customizationGroups,
  };
}

/**
 * Validate + normalize the create-menu-day body into the camelCase payload the
 * `create_provider_menu_day` RPC reads. Aggregates every field issue (with indexed
 * `components[i]…` paths) into one `ValidationError`. `menuDate`/`cutoffAt` must be
 * present + well-formed and there must be at least one component; the cross-field
 * customization bounds + the catalog active+owned check are enforced downstream
 * (DB CHECKs + the RPC).
 */
export function validateCreateMenuDay(
  body: JsonObject,
): NormalizedMenuDayCreate {
  const issues: ValidationIssue[] = [];

  const menuDate = validDate(body.menuDate, "menuDate", issues);
  const cutoffAt = validTimestamp(body.cutoffAt, "cutoffAt", issues);
  const note = optionalText(body.note, "note", issues, NOTE_MAX);

  const componentsRaw = body.components;
  const components: NormalizedMenuComponent[] = [];
  if (!Array.isArray(componentsRaw) || componentsRaw.length === 0) {
    issues.push({ field: "components", rule: "required" });
  } else if (componentsRaw.length > MAX_COMPONENTS) {
    issues.push({ field: "components", rule: "maxItems", max: MAX_COMPONENTS });
  } else {
    componentsRaw.forEach((comp, i) => {
      const parsed = validateComponent(comp, `components[${i}]`, issues, i);
      if (parsed) components.push(parsed);
    });
  }

  if (issues.length > 0) {
    throw new ValidationError("Some menu details are invalid.", issues);
  }

  return {
    menuDate: menuDate as string,
    cutoffAt: cutoffAt as string,
    note: note ?? null,
    components,
  };
}
