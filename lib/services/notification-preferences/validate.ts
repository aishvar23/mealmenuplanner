import { ValidationError } from "@/lib/errors";
import {
  isSettableEmailCategory,
  SETTABLE_EMAIL_CATEGORIES,
} from "@/lib/events/categories";
import type { JsonObject } from "@/lib/http";

/**
 * Validate a notification-settings PUT body into a complete category → boolean
 * map. Pure (no I/O) so it's unit-testable. Reads `body.categories`, requires it
 * to be an object of booleans keyed by KNOWN settable categories (an unknown key
 * or a non-boolean value is a `ValidationError`), and fills any category the
 * client omitted with `false` — so the result is always total over
 * `SETTABLE_EMAIL_CATEGORIES` and a save reflects exactly what the form showed.
 */
export function parseEmailPreferencesInput(
  body: JsonObject,
): Record<string, boolean> {
  const raw = body.categories;
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) {
    throw new ValidationError(
      "categories must be an object of category → boolean.",
      [{ field: "categories", rule: "object" }],
    );
  }

  const result: Record<string, boolean> = {};
  for (const category of SETTABLE_EMAIL_CATEGORIES) result[category] = false;

  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!isSettableEmailCategory(key)) {
      throw new ValidationError(`Unknown notification category: ${key}.`, [
        { field: `categories.${key}`, rule: "knownCategory" },
      ]);
    }
    if (typeof value !== "boolean") {
      throw new ValidationError(`categories.${key} must be a boolean.`, [
        { field: `categories.${key}`, rule: "boolean" },
      ]);
    }
    result[key] = value;
  }

  return result;
}
