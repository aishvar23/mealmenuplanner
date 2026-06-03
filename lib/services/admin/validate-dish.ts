/**
 * Dish create/update validation + inbound translation (camelCase → snake_case),
 * the input half of the `admin` translation boundary (design/04 § 1). Pure and
 * I/O-free, so the service layer just calls it and the DB CHECK/enum/NOT NULL
 * constraints (design/01 `dishes`) stay the independent backstop.
 *
 * `status` is intentionally NOT editable here — status transitions run through
 * the dedicated activate/archive path so activation is always gated by the
 * quality checklist (P3-8). `total_time_minutes` is generated, so it is never
 * written either.
 */

import { Constants } from "@/lib/db/database.types";
import type { Database } from "@/lib/db/database.types";
import { ValidationError, type ValidationIssue } from "@/lib/errors";
import type { JsonObject } from "@/lib/http";

import {
  isBoundedString,
  isEnumValue,
  isInteger,
  isNonEmptyString,
  isStringArray,
  MAX_TEXT_LENGTH,
} from "./field-validators";

const DIET_TYPES = Constants.public.Enums.diet_type;
const SPICE_LEVELS = Constants.public.Enums.spice_level;
const DIFFICULTY_LEVELS = Constants.public.Enums.difficulty_level;
const MEAL_SLOTS = Constants.public.Enums.meal_slot;
const DISH_STATUSES = Constants.public.Enums.dish_status;
const IMAGE_STATUSES = Constants.public.Enums.image_status;

type MealSlot = Database["public"]["Enums"]["meal_slot"];
type DietType = Database["public"]["Enums"]["diet_type"];
type DishStatus = Database["public"]["Enums"]["dish_status"];

/** The dish-list filters the operator console supports (docs/06, P3-2). */
export interface DishListFilters {
  /** Case-insensitive substring match on `name`. */
  search?: string;
  cuisine?: string;
  mealSlot?: MealSlot;
  dietType?: DietType;
  status?: DishStatus;
  /** Restrict to dishes missing required activation metadata. */
  missingMetadata?: boolean;
}

/**
 * Parse the dish-list query string into typed filters. **Lenient**: an
 * unrecognized enum value is dropped (no filter) rather than rejected, so a
 * stale or hand-typed query never 400s a read-only list. Enum sets come from
 * the generated `Constants` so they can't drift.
 */
export function parseDishListFilters(params: URLSearchParams): DishListFilters {
  const filters: DishListFilters = {};

  const search = params.get("search")?.trim();
  if (search) filters.search = search;

  const cuisine = params.get("cuisine")?.trim();
  if (cuisine) filters.cuisine = cuisine;

  const mealSlot = params.get("mealSlot");
  if (isEnumValue(mealSlot, MEAL_SLOTS)) filters.mealSlot = mealSlot;

  const dietType = params.get("dietType");
  if (isEnumValue(dietType, DIET_TYPES)) filters.dietType = dietType;

  const status = params.get("status");
  if (isEnumValue(status, DISH_STATUSES)) filters.status = status;

  if (params.get("missingMetadata") === "true") filters.missingMetadata = true;

  return filters;
}

type DishInsert = Database["public"]["Tables"]["dishes"]["Insert"];
type DishUpdate = Database["public"]["Tables"]["dishes"]["Update"];

/** The editable subset of `dishes` (no generated `total_time`, no `status`). */
type DishWriteFields = Omit<
  DishUpdate,
  "id" | "status" | "total_time_minutes" | "created_at" | "updated_at"
>;

/** Nullable free-text fields cleared with `null` or set with a bounded string. */
const NULLABLE_TEXT_FIELDS: ReadonlyArray<
  [
    camel: string,
    snake: "description" | "cuisine" | "region" | "image_alt_text",
  ]
> = [
  ["description", "description"],
  ["cuisine", "cuisine"],
  ["region", "region"],
  ["imageAltText", "image_alt_text"],
];

/** Boolean descriptor flags on `dishes` (design/01). */
const BOOLEAN_FLAGS: ReadonlyArray<
  [camel: string, snake: keyof DishWriteFields]
> = [
  ["kidFriendly", "kid_friendly"],
  ["lunchboxFriendly", "lunchbox_friendly"],
  ["leftoverFriendly", "leftover_friendly"],
  ["batchCookFriendly", "batch_cook_friendly"],
  ["diabeticFriendly", "diabetic_friendly"],
  ["lowSodium", "low_sodium"],
  ["highProtein", "high_protein"],
  ["lowCarb", "low_carb"],
  ["weightLoss", "weight_loss"],
];

/**
 * Read every recognized dish field present on `body` into a snake_case partial,
 * pushing a `ValidationIssue` for each malformed value. `name`/`dietType` are
 * validated when present but their REQUIREDness is enforced by the caller
 * (insert vs. update), so this stays shared.
 */
function collectDishFields(
  body: JsonObject,
  issues: ValidationIssue[],
): DishWriteFields {
  const fields: DishWriteFields = {};
  const has = (key: string): boolean => Object.hasOwn(body, key);

  if (has("name")) {
    const value = body.name;
    if (isNonEmptyString(value) && value.length <= MAX_TEXT_LENGTH) {
      fields.name = value.trim();
    } else {
      issues.push({ field: "name", rule: "nonEmptyString" });
    }
  }

  if (has("dietType")) {
    const value = body.dietType;
    if (isEnumValue(value, DIET_TYPES)) {
      fields.diet_type = value;
    } else {
      issues.push({ field: "dietType", rule: "enum", allowed: DIET_TYPES });
    }
  }

  for (const [camel, snake] of NULLABLE_TEXT_FIELDS) {
    if (!has(camel)) continue;
    const value = body[camel];
    if (value === null) {
      fields[snake] = null;
    } else if (isBoundedString(value)) {
      fields[snake] = value.trim() === "" ? null : value.trim();
    } else {
      issues.push({ field: camel, rule: "stringOrNull" });
    }
  }

  if (has("mealSlots")) {
    const value = body.mealSlots;
    if (
      isStringArray(value) &&
      value.every((slot) => (MEAL_SLOTS as readonly string[]).includes(slot))
    ) {
      fields.meal_slots = value;
    } else {
      issues.push({
        field: "mealSlots",
        rule: "enumArray",
        allowed: MEAL_SLOTS,
      });
    }
  }

  if (has("prepTimeMinutes")) {
    const value = body.prepTimeMinutes;
    if (isInteger(value) && value >= 0) {
      fields.prep_time_minutes = value;
    } else {
      issues.push({ field: "prepTimeMinutes", rule: "min", min: 0 });
    }
  }

  if (has("cookTimeMinutes")) {
    const value = body.cookTimeMinutes;
    if (isInteger(value) && value >= 0) {
      fields.cook_time_minutes = value;
    } else {
      issues.push({ field: "cookTimeMinutes", rule: "min", min: 0 });
    }
  }

  if (has("difficulty")) {
    const value = body.difficulty;
    if (isEnumValue(value, DIFFICULTY_LEVELS)) {
      fields.difficulty = value;
    } else {
      issues.push({
        field: "difficulty",
        rule: "enum",
        allowed: DIFFICULTY_LEVELS,
      });
    }
  }

  if (has("spiceLevel")) {
    const value = body.spiceLevel;
    if (isEnumValue(value, SPICE_LEVELS)) {
      fields.spice_level = value;
    } else {
      issues.push({ field: "spiceLevel", rule: "enum", allowed: SPICE_LEVELS });
    }
  }

  if (has("imageUrl")) {
    const value = body.imageUrl;
    if (value === null) {
      fields.image_url = null;
    } else if (isImageUrl(value)) {
      fields.image_url = value.trim() === "" ? null : value.trim();
    } else {
      issues.push({ field: "imageUrl", rule: "urlOrPathOrNull" });
    }
  }

  if (has("imageStatus")) {
    const value = body.imageStatus;
    if (isEnumValue(value, IMAGE_STATUSES)) {
      fields.image_status = value;
    } else {
      issues.push({
        field: "imageStatus",
        rule: "enum",
        allowed: IMAGE_STATUSES,
      });
    }
  }

  if (has("imageVerified")) {
    const value = body.imageVerified;
    if (typeof value === "boolean") {
      fields.image_verified = value;
    } else {
      issues.push({ field: "imageVerified", rule: "boolean" });
    }
  }

  for (const [camel, snake] of BOOLEAN_FLAGS) {
    if (!has(camel)) continue;
    const value = body[camel];
    if (typeof value === "boolean") {
      (fields[snake] as boolean) = value;
    } else {
      issues.push({ field: camel, rule: "boolean" });
    }
  }

  if (fields.image_status === "verified") {
    const alt =
      typeof body.imageAltText === "string" ? body.imageAltText.trim() : "";
    const url = typeof body.imageUrl === "string" ? body.imageUrl.trim() : "";
    if (!alt) {
      issues.push({
        field: "imageAltText",
        rule: "requiredWhenImageVerified",
      });
    }
    if (!url) {
      issues.push({ field: "imageUrl", rule: "requiredWhenImageVerified" });
    }
  }

  if (fields.image_verified === true && fields.image_status !== "verified") {
    issues.push({
      field: "imageVerified",
      rule: "requiresVerifiedStatus",
    });
  }

  return fields;
}

function isImageUrl(value: unknown): value is string {
  if (!isBoundedString(value)) return false;
  const trimmed = value.trim();
  if (trimmed === "") return true;
  if (trimmed.startsWith("/")) return true;
  try {
    const url = new URL(trimmed);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

/**
 * Validate + translate a dish **create** body. `name` and `dietType` are
 * required (the only NOT NULL columns without a default); everything else falls
 * back to the schema defaults. Throws a single `ValidationError` carrying every
 * field issue. New dishes are always `draft` (the DB default) — they reach
 * `active` only through the checklist-gated activation path.
 */
export function buildDishInsert(body: JsonObject): DishInsert {
  const issues: ValidationIssue[] = [];

  if (!Object.hasOwn(body, "name") || !isNonEmptyString(body.name)) {
    issues.push({ field: "name", rule: "required" });
  }
  if (!Object.hasOwn(body, "dietType")) {
    issues.push({ field: "dietType", rule: "required" });
  }

  const fields = collectDishFields(body, issues);

  if (issues.length > 0) {
    throw new ValidationError("One or more dish fields are invalid.", issues);
  }

  // Required-field presence is validated above; assert the shape for the typed
  // Insert (name + diet_type are guaranteed present here).
  return fields as DishInsert;
}

/**
 * Validate + translate a dish **update** body (partial — any subset). Throws
 * `ValidationError` on a malformed field or an empty update (a no-op `SET`).
 */
export function buildDishUpdate(body: JsonObject): DishUpdate {
  const issues: ValidationIssue[] = [];
  const fields = collectDishFields(body, issues);

  if (issues.length > 0) {
    throw new ValidationError("One or more dish fields are invalid.", issues);
  }
  if (Object.keys(fields).length === 0) {
    throw new ValidationError("At least one dish field is required.", [
      { field: "body", rule: "nonEmpty" },
    ]);
  }

  return fields;
}
