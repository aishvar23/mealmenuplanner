import type { ValidationIssue } from "@/lib/errors";

/**
 * Shared parser for the `ValidationIssue[]` a provider write RPC carries on its
 * error `detail` (the `*INC` menu-incompleteness codes — `PMINC` from the publish
 * writer, `MAINC` from the authoring writer — both emit a `jsonb` array of issues).
 * One implementation so the publish and authoring services can never drift on the
 * wire format. No I/O, so it unit-tests in isolation.
 */

/** A parsed detail element is only an issue if it carries the required string keys. */
export function isValidationIssue(value: unknown): value is ValidationIssue {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return typeof v.field === "string" && typeof v.rule === "string";
}

/**
 * Parse the JSON `ValidationIssue[]` an RPC carries on its error `detail`. Falls back
 * to `generic` when the detail is absent, unparseable, or carries no well-formed
 * issue — so the caller always gets at least one field-scoped issue to surface.
 */
export function parseRpcIssues(
  detail: string | null | undefined,
  generic: ValidationIssue[],
): ValidationIssue[] {
  if (!detail) return generic;
  try {
    const parsed: unknown = JSON.parse(detail);
    if (Array.isArray(parsed)) {
      const issues = parsed.filter(isValidationIssue);
      if (issues.length > 0) return issues;
    }
  } catch {
    /* fall through to the generic issue below */
  }
  return generic;
}
