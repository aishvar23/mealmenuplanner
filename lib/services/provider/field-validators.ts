import type { ValidationIssue } from "@/lib/errors";
import { isUuid } from "@/lib/validation/uuid";

/**
 * Shared, pure non-text field validators for the provider service write flows —
 * UUIDs, enums, and the `numeric(10,3)` quantity scale/range. No I/O /
 * `server-only` / Supabase, so they unit-test in isolation and are reused by
 * {@link file://./catalog-validation.ts} (catalog quantities + soft-link UUIDs) and
 * {@link file://./response-validation.ts} (response component/option UUIDs, spice/
 * salt enums, customization increment quantities) — one implementation of the
 * uuid/enum/quantity rules so the write paths can never drift. The text rules live
 * alongside in {@link file://./text-validators.ts}.
 */

/**
 * Bounds coordinated with the provider `numeric(10,3)` quantity columns
 * (`default_quantity`, alternative `quantity`, customization increment `quantity`):
 * a value with more than {@link QUANTITY_SCALE} decimals would be silently rounded
 * by Postgres (a quiet data-fidelity loss), and a value above {@link QUANTITY_MAX}
 * (the column's true capacity) would raise a `22003` overflow at insert instead of a
 * clean 400. Validating both here keeps the validators the single source of truth
 * for what the columns can faithfully hold.
 */
export const QUANTITY_SCALE = 3;
export const QUANTITY_MAX = 9_999_999.999;

/**
 * True if `value` carries more than {@link QUANTITY_SCALE} decimal places (or is
 * expressed in scientific notation, which only arises outside the normal quantity
 * range) — i.e. a precision the `numeric(10,3)` columns can't hold without silently
 * rounding. Uses the number's canonical string form to avoid float-multiply error.
 */
export function exceedsQuantityScale(value: number): boolean {
  const s = value.toString();
  if (s.includes("e") || s.includes("E")) return true;
  const dot = s.indexOf(".");
  return dot !== -1 && s.length - dot - 1 > QUANTITY_SCALE;
}

/** A required UUID at `field`; pushes a `uuid` issue and returns null if bad. */
export function requiredUuid(
  value: unknown,
  field: string,
  issues: ValidationIssue[],
): string | null {
  if (typeof value !== "string" || !isUuid(value)) {
    issues.push({ field, rule: "uuid" });
    return null;
  }
  return value;
}

/**
 * An optional nullable UUID: `undefined` → omitted (returns `undefined`), `null` →
 * `null`, otherwise a valid UUID. Pushes a `uuid` issue (and returns `undefined`) on
 * a malformed value.
 */
export function optionalUuid(
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

/** An optional enum value (null/undefined → null); pushes an `enum` issue if bad. */
export function optionalEnum<T extends string>(
  value: unknown,
  field: string,
  allowed: readonly T[],
  issues: ValidationIssue[],
): T | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string" || !allowed.includes(value as T)) {
    issues.push({ field, rule: "enum", allowed });
    return null;
  }
  return value as T;
}
