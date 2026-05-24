/**
 * Ingredient create/update validation + inbound translation (camelCase →
 * snake_case). Pure, mirroring the dish validator. Rules track the `ingredients`
 * table (design/01); the unique `name` constraint stays the DB-level backstop
 * (surfaced as a `ConflictError` by the service).
 */

import type { Database } from "@/lib/db/database.types";
import { ValidationError, type ValidationIssue } from "@/lib/errors";
import type { JsonObject } from "@/lib/http";

import {
  isBoundedString,
  isNonEmptyString,
  isStringArray,
  MAX_TEXT_LENGTH,
} from "./field-validators";

type IngredientInsert = Database["public"]["Tables"]["ingredients"]["Insert"];
type IngredientUpdate = Database["public"]["Tables"]["ingredients"]["Update"];

type IngredientWriteFields = Omit<
  IngredientUpdate,
  "id" | "created_at" | "updated_at"
>;

/** Required non-empty text fields, by [camelCase, snake_case] name. */
const REQUIRED_TEXT_FIELDS: ReadonlyArray<
  [camel: string, snake: "name" | "category" | "default_unit"]
> = [
  ["name", "name"],
  ["category", "category"],
  ["defaultUnit", "default_unit"],
];

function collectIngredientFields(
  body: JsonObject,
  issues: ValidationIssue[],
): IngredientWriteFields {
  const fields: IngredientWriteFields = {};
  const has = (key: string): boolean => Object.hasOwn(body, key);

  for (const [camel, snake] of REQUIRED_TEXT_FIELDS) {
    if (!has(camel)) continue;
    const value = body[camel];
    if (isNonEmptyString(value) && value.length <= MAX_TEXT_LENGTH) {
      fields[snake] = value.trim();
    } else {
      issues.push({ field: camel, rule: "nonEmptyString" });
    }
  }

  if (has("commonNames")) {
    const value = body.commonNames;
    if (isStringArray(value)) {
      fields.common_names = value.map((name) => name.trim()).filter(Boolean);
    } else {
      issues.push({ field: "commonNames", rule: "stringArray" });
    }
  }

  if (has("allergenType")) {
    const value = body.allergenType;
    if (value === null) {
      fields.allergen_type = null;
    } else if (isBoundedString(value)) {
      fields.allergen_type = value.trim() === "" ? null : value.trim();
    } else {
      issues.push({ field: "allergenType", rule: "stringOrNull" });
    }
  }

  return fields;
}

/** Validate + translate an ingredient **create** body (name/category/unit required). */
export function buildIngredientInsert(body: JsonObject): IngredientInsert {
  const issues: ValidationIssue[] = [];

  for (const [camel] of REQUIRED_TEXT_FIELDS) {
    if (!Object.hasOwn(body, camel) || !isNonEmptyString(body[camel])) {
      issues.push({ field: camel, rule: "required" });
    }
  }

  const fields = collectIngredientFields(body, issues);

  if (issues.length > 0) {
    throw new ValidationError(
      "One or more ingredient fields are invalid.",
      issues,
    );
  }

  return fields as IngredientInsert;
}

/** Validate + translate an ingredient **update** body (partial). */
export function buildIngredientUpdate(body: JsonObject): IngredientUpdate {
  const issues: ValidationIssue[] = [];
  const fields = collectIngredientFields(body, issues);

  if (issues.length > 0) {
    throw new ValidationError(
      "One or more ingredient fields are invalid.",
      issues,
    );
  }
  if (Object.keys(fields).length === 0) {
    throw new ValidationError("At least one ingredient field is required.", [
      { field: "body", rule: "nonEmpty" },
    ]);
  }

  return fields;
}
