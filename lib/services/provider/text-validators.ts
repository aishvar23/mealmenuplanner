import type { ValidationIssue } from "@/lib/errors";

/**
 * Shared, pure text-field validators for the provider service write flows. No
 * I/O / `server-only` / Supabase, so they unit-test in isolation and are reused
 * by both {@link file://./validation.ts} (org settings) and
 * {@link file://./catalog-validation.ts} (catalog items) — one implementation of
 * the trim/blank/length rules so the two write paths can never drift.
 */

/** A trimmed, bounded required string; pushes an issue and returns null if invalid. */
export function requiredText(
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
export function optionalText(
  value: unknown,
  field: string,
  issues: ValidationIssue[],
  max = 200,
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
