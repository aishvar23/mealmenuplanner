/**
 * Dish-ingredient (link) create/update validation + inbound translation. Pure.
 * Rules track `dish_ingredients` (design/01): `quantity_per_serving > 0`,
 * `unit` required, `is_required`/`is_optional` booleans. The `unique(dish_id,
 * ingredient_id)` and `ingredient_id` FK constraints stay the DB backstop
 * (surfaced as `ConflictError` / `ValidationError` by the service).
 *
 * `dish_id` comes from the URL path, never the body, so it is not validated here.
 */

import type { Database } from "@/lib/db/database.types";
import { ValidationError, type ValidationIssue } from "@/lib/errors";
import type { JsonObject } from "@/lib/http";

import {
  isFiniteNumber,
  isNonEmptyString,
  isUuidValue,
  MAX_TEXT_LENGTH,
} from "./field-validators";

type DishIngredientInsert =
  Database["public"]["Tables"]["dish_ingredients"]["Insert"];
type DishIngredientUpdate =
  Database["public"]["Tables"]["dish_ingredients"]["Update"];

/** Editable link fields (no id/dish_id/timestamps). */
type LinkFields = Omit<
  DishIngredientUpdate,
  "id" | "dish_id" | "ingredient_id" | "created_at" | "updated_at"
> & { ingredient_id?: string };

function collectLinkFields(
  body: JsonObject,
  issues: ValidationIssue[],
): LinkFields {
  const fields: LinkFields = {};
  const has = (key: string): boolean => Object.hasOwn(body, key);

  if (has("ingredientId")) {
    const value = body.ingredientId;
    if (isUuidValue(value)) {
      fields.ingredient_id = value;
    } else {
      issues.push({ field: "ingredientId", rule: "uuid" });
    }
  }

  if (has("quantityPerServing")) {
    const value = body.quantityPerServing;
    if (isFiniteNumber(value) && value > 0) {
      fields.quantity_per_serving = value;
    } else {
      issues.push({ field: "quantityPerServing", rule: "positiveNumber" });
    }
  }

  if (has("unit")) {
    const value = body.unit;
    if (isNonEmptyString(value) && value.length <= MAX_TEXT_LENGTH) {
      fields.unit = value.trim();
    } else {
      issues.push({ field: "unit", rule: "nonEmptyString" });
    }
  }

  if (has("isRequired")) {
    const value = body.isRequired;
    if (typeof value === "boolean") {
      fields.is_required = value;
    } else {
      issues.push({ field: "isRequired", rule: "boolean" });
    }
  }

  if (has("isOptional")) {
    const value = body.isOptional;
    if (typeof value === "boolean") {
      fields.is_optional = value;
    } else {
      issues.push({ field: "isOptional", rule: "boolean" });
    }
  }

  return fields;
}

/**
 * Validate + translate an **add ingredient to dish** body. `ingredientId`,
 * `quantityPerServing`, and `unit` are required; returns the link fields ready
 * to merge with the path's `dish_id` in the service.
 */
export function buildDishIngredientInsert(
  body: JsonObject,
): Omit<DishIngredientInsert, "dish_id"> {
  const issues: ValidationIssue[] = [];

  if (!Object.hasOwn(body, "ingredientId") || !isUuidValue(body.ingredientId)) {
    issues.push({ field: "ingredientId", rule: "required" });
  }
  if (!Object.hasOwn(body, "quantityPerServing")) {
    issues.push({ field: "quantityPerServing", rule: "required" });
  }
  if (!Object.hasOwn(body, "unit") || !isNonEmptyString(body.unit)) {
    issues.push({ field: "unit", rule: "required" });
  }

  const fields = collectLinkFields(body, issues);

  if (issues.length > 0) {
    throw new ValidationError(
      "One or more dish-ingredient fields are invalid.",
      issues,
    );
  }

  return fields as Omit<DishIngredientInsert, "dish_id">;
}

/** Validate + translate a dish-ingredient **update** body (partial). */
export function buildDishIngredientUpdate(
  body: JsonObject,
): DishIngredientUpdate {
  const issues: ValidationIssue[] = [];
  const fields = collectLinkFields(body, issues);

  if (issues.length > 0) {
    throw new ValidationError(
      "One or more dish-ingredient fields are invalid.",
      issues,
    );
  }
  if (Object.keys(fields).length === 0) {
    throw new ValidationError(
      "At least one dish-ingredient field is required.",
      [{ field: "body", rule: "nonEmpty" }],
    );
  }

  return fields;
}
