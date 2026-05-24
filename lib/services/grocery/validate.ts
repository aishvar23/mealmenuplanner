/**
 * Request validation for the `grocery` service (design/04 § 4.6) — pure and
 * I/O-free so the rules are unit-testable and the services just call them.
 */

import { ValidationError } from "@/lib/errors";
import type { JsonObject } from "@/lib/http";
import { isUuid } from "@/lib/validation";

/**
 * Validate a required `mealPlanId` (a uuid) from a body or query value
 * (design/04 § 4.6 GET query + regenerate body). Throws `ValidationError` (400)
 * for an absent or malformed id.
 */
export function validateMealPlanId(value: unknown): string {
  if (typeof value !== "string" || !isUuid(value)) {
    throw new ValidationError("A valid mealPlanId is required.", [
      { field: "mealPlanId", rule: "uuid" },
    ]);
  }
  return value;
}

/** Validate the regenerate body `{ mealPlanId }` (design/04 § 4.6). */
export function validateRegenerateRequest(body: JsonObject): {
  mealPlanId: string;
} {
  return { mealPlanId: validateMealPlanId(body.mealPlanId) };
}

/** Validate the check-off body `{ checked: boolean }` (design/08 § 9). */
export function validateCheckedRequest(body: JsonObject): { checked: boolean } {
  if (typeof body.checked !== "boolean") {
    throw new ValidationError("`checked` must be a boolean.", [
      { field: "checked", rule: "boolean" },
    ]);
  }
  return { checked: body.checked };
}
