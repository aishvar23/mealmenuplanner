import { ValidationError, type ValidationIssue } from "@/lib/errors";
import type { JsonObject } from "@/lib/http";
import {
  PROVIDER_SALT_LEVELS,
  PROVIDER_SPICE_LEVELS,
} from "@/packages/shared/provider";
import type {
  ProviderSaltLevel,
  ProviderSpiceLevel,
} from "@/packages/shared/provider";

import {
  QUANTITY_MAX,
  QUANTITY_SCALE,
  exceedsQuantityScale,
  optionalEnum,
  requiredUuid,
} from "./field-validators";
import { optionalText } from "./text-validators";

// Re-exported for the service barrel (`./index`) — the canonical lists live in
// `@mmp/shared/provider` so the web/mobile response pickers and this validator
// share one set.
export { PROVIDER_SALT_LEVELS, PROVIDER_SPICE_LEVELS };

/**
 * Pure request validation for the member response save flow (MP-A-130, contract
 * 03 § 6/§ 8). No I/O / `server-only` / Supabase, so the rules unit-test in
 * isolation; the `save_provider_response` RPC + DB CHECK/RLS constraints stay the
 * authoritative backstop (and DERIVE the quantity/unit — never trusted here) —
 * this just turns a malformed body into a clean `ValidationError` (400) with
 * field-scoped issues instead of a Postgres error mapped to a 500.
 *
 * It deliberately does NOT validate that a component/alternative/option actually
 * exists on the menu (that requires the DB and is the RPC's job, surfaced as the
 * `invalid_menu_alternative` / `invalid_customization` reasons); it only checks
 * the request is structurally well-formed.
 */

const NOTE_MAX = 1000;
const REASON_MAX = 1000;
const MAX_ITEMS = 30;
const MAX_CUSTOMIZATIONS = 30;
// A customization increment count is bounded here only as a sanity cap (the
// `numeric(10,3)` range/scale via the shared QUANTITY_MAX/exceedsQuantityScale); the
// real, provider-specific maximum is enforced by the RPC (BR-010).

/** The normalized save payload the service hands to the RPC (items stay camelCase
 * for the jsonb arg the RPC reads). `quantity`/`canonicalUnit` are intentionally
 * dropped — the RPC derives them from the menu config (§ 11.6). */
export interface NormalizedResponseItem {
  menuComponentId: string;
  selectedCatalogItemId: string;
  spiceLevel: ProviderSpiceLevel | null;
  saltLevel: ProviderSaltLevel | null;
  customizations: Array<{
    customizationOptionId: string;
    quantity: number | null;
  }>;
}
export interface NormalizedResponseSave {
  expectedVersion: number | null;
  memberNote: string | null;
  items: NormalizedResponseItem[];
}

/** A customization increment quantity: null/undefined → null, else a finite
 * positive number within the column's range/scale (shared with the catalog
 * quantity rules via {@link file://./field-validators.ts}). */
function optionalQuantity(
  value: unknown,
  field: string,
  issues: ValidationIssue[],
): number | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    issues.push({ field, rule: "positive" });
    return null;
  }
  if (value > QUANTITY_MAX) {
    issues.push({ field, rule: "max", max: QUANTITY_MAX });
    return null;
  }
  if (exceedsQuantityScale(value)) {
    issues.push({ field, rule: "scale", scale: QUANTITY_SCALE });
    return null;
  }
  return value;
}

/** Validate `expectedVersion`: a non-negative integer, or null/undefined (a first
 * save claims no version). */
function expectedVersion(
  value: unknown,
  issues: ValidationIssue[],
): number | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    issues.push({ field: "expectedVersion", rule: "integer" });
    return null;
  }
  return value;
}

/** Validate one customization selection on a response line. */
function normalizeCustomization(
  raw: unknown,
  index: number,
  itemIndex: number,
  issues: ValidationIssue[],
): NormalizedResponseItem["customizations"][number] | null {
  const field = `items[${itemIndex}].customizations[${index}]`;
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    issues.push({ field, rule: "object" });
    return null;
  }
  const c = raw as JsonObject;
  const optionId = requiredUuid(
    c.customizationOptionId,
    `${field}.customizationOptionId`,
    issues,
  );
  const quantity = optionalQuantity(c.quantity, `${field}.quantity`, issues);
  if (optionId === null) return null;
  return { customizationOptionId: optionId, quantity };
}

/** Validate one response line (a component selection + its customizations). */
function normalizeItem(
  raw: unknown,
  index: number,
  issues: ValidationIssue[],
): NormalizedResponseItem | null {
  const field = `items[${index}]`;
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    issues.push({ field, rule: "object" });
    return null;
  }
  const item = raw as JsonObject;
  const menuComponentId = requiredUuid(
    item.menuComponentId,
    `${field}.menuComponentId`,
    issues,
  );
  const selectedCatalogItemId = requiredUuid(
    item.selectedCatalogItemId,
    `${field}.selectedCatalogItemId`,
    issues,
  );
  const spiceLevel = optionalEnum(
    item.spiceLevel,
    `${field}.spiceLevel`,
    PROVIDER_SPICE_LEVELS,
    issues,
  );
  const saltLevel = optionalEnum(
    item.saltLevel,
    `${field}.saltLevel`,
    PROVIDER_SALT_LEVELS,
    issues,
  );

  const customizations: NormalizedResponseItem["customizations"] = [];
  const rawCustomizations = item.customizations;
  if (rawCustomizations !== undefined && rawCustomizations !== null) {
    if (!Array.isArray(rawCustomizations)) {
      issues.push({ field: `${field}.customizations`, rule: "array" });
    } else if (rawCustomizations.length > MAX_CUSTOMIZATIONS) {
      issues.push({
        field: `${field}.customizations`,
        rule: "max",
        max: MAX_CUSTOMIZATIONS,
      });
    } else {
      rawCustomizations.forEach((c, i) => {
        const normalized = normalizeCustomization(c, i, index, issues);
        if (normalized !== null) customizations.push(normalized);
      });
    }
  }

  if (menuComponentId === null || selectedCatalogItemId === null) return null;
  return {
    menuComponentId,
    selectedCatalogItemId,
    spiceLevel,
    saltLevel,
    customizations,
  };
}

/**
 * Validate + normalize a `SaveProviderResponseRequest` body. `items` must be an
 * array (an empty array is allowed — it clears a draft's selections). Throws
 * `ValidationError` aggregating every field issue.
 */
export function validateSaveProviderResponse(
  body: JsonObject,
): NormalizedResponseSave {
  const issues: ValidationIssue[] = [];

  const version = expectedVersion(body.expectedVersion, issues);
  const memberNote = optionalText(
    body.memberNote,
    "memberNote",
    issues,
    NOTE_MAX,
  );

  const items: NormalizedResponseItem[] = [];
  const rawItems = body.items;
  if (!Array.isArray(rawItems)) {
    issues.push({ field: "items", rule: "array" });
  } else if (rawItems.length > MAX_ITEMS) {
    issues.push({ field: "items", rule: "max", max: MAX_ITEMS });
  } else {
    rawItems.forEach((raw, i) => {
      const normalized = normalizeItem(raw, i, issues);
      if (normalized !== null) items.push(normalized);
    });
  }

  if (issues.length > 0) {
    throw new ValidationError("Some response details are invalid.", issues);
  }

  return { expectedVersion: version, memberNote: memberNote ?? null, items };
}

/** The normalized provider-override payload the override service hands to the RPC.
 * `reason` is mandatory (BR-007); `items` reuse the member-save item rules — quantity/
 * unit are dropped here and DERIVED by the RPC from the menu config (§ 11.6). */
export interface NormalizedProviderOverride {
  reason: string;
  items: NormalizedResponseItem[];
}

/**
 * Validate + normalize a `ProviderOverrideResponseRequest` body (UC-OVERRIDE-001,
 * MP-A-150). `reason` is required (trimmed, non-empty, ≤ {@link REASON_MAX}); `items`
 * follow the same structural rules as a member save (an empty array is allowed — the
 * RPC + DB constraints stay the authoritative backstop). Throws `ValidationError`
 * aggregating every field issue.
 */
export function validateProviderOverride(
  body: JsonObject,
): NormalizedProviderOverride {
  const issues: ValidationIssue[] = [];

  let reason = "";
  if (typeof body.reason !== "string" || body.reason.trim() === "") {
    issues.push({ field: "reason", rule: "required" });
  } else {
    reason = body.reason.trim();
    if (reason.length > REASON_MAX) {
      issues.push({ field: "reason", rule: "max", max: REASON_MAX });
    }
  }

  const items: NormalizedResponseItem[] = [];
  const rawItems = body.items;
  if (!Array.isArray(rawItems)) {
    issues.push({ field: "items", rule: "array" });
  } else if (rawItems.length > MAX_ITEMS) {
    issues.push({ field: "items", rule: "max", max: MAX_ITEMS });
  } else {
    rawItems.forEach((raw, i) => {
      const normalized = normalizeItem(raw, i, issues);
      if (normalized !== null) items.push(normalized);
    });
  }

  if (issues.length > 0) {
    throw new ValidationError("Some override details are invalid.", issues);
  }

  return { reason, items };
}
