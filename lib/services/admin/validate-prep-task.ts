/**
 * Prep-task create/update validation + inbound translation. Pure. Rules track
 * `dish_prep_tasks` (design/01): `task_name` required, `required_before_minutes`
 * a non-negative int, `description` nullable. `dish_id` comes from the path.
 */

import type { Database } from "@/lib/db/database.types";
import { ValidationError, type ValidationIssue } from "@/lib/errors";
import type { JsonObject } from "@/lib/http";

import {
  isBoundedString,
  isInteger,
  isNonEmptyString,
  MAX_TEXT_LENGTH,
} from "./field-validators";

type PrepTaskInsert = Database["public"]["Tables"]["dish_prep_tasks"]["Insert"];
type PrepTaskUpdate = Database["public"]["Tables"]["dish_prep_tasks"]["Update"];

type PrepTaskFields = Omit<
  PrepTaskUpdate,
  "id" | "dish_id" | "created_at" | "updated_at"
>;

function collectPrepTaskFields(
  body: JsonObject,
  issues: ValidationIssue[],
): PrepTaskFields {
  const fields: PrepTaskFields = {};
  const has = (key: string): boolean => Object.hasOwn(body, key);

  if (has("taskName")) {
    const value = body.taskName;
    if (isNonEmptyString(value) && value.length <= MAX_TEXT_LENGTH) {
      fields.task_name = value.trim();
    } else {
      issues.push({ field: "taskName", rule: "nonEmptyString" });
    }
  }

  if (has("requiredBeforeMinutes")) {
    const value = body.requiredBeforeMinutes;
    if (isInteger(value) && value >= 0) {
      fields.required_before_minutes = value;
    } else {
      issues.push({ field: "requiredBeforeMinutes", rule: "min", min: 0 });
    }
  }

  if (has("description")) {
    const value = body.description;
    if (value === null) {
      fields.description = null;
    } else if (isBoundedString(value)) {
      fields.description = value.trim() === "" ? null : value.trim();
    } else {
      issues.push({ field: "description", rule: "stringOrNull" });
    }
  }

  return fields;
}

/** Validate + translate an **add prep task** body (taskName + minutes required). */
export function buildPrepTaskInsert(
  body: JsonObject,
): Omit<PrepTaskInsert, "dish_id"> {
  const issues: ValidationIssue[] = [];

  if (!Object.hasOwn(body, "taskName") || !isNonEmptyString(body.taskName)) {
    issues.push({ field: "taskName", rule: "required" });
  }
  if (!Object.hasOwn(body, "requiredBeforeMinutes")) {
    issues.push({ field: "requiredBeforeMinutes", rule: "required" });
  }

  const fields = collectPrepTaskFields(body, issues);

  if (issues.length > 0) {
    throw new ValidationError(
      "One or more prep-task fields are invalid.",
      issues,
    );
  }

  return fields as Omit<PrepTaskInsert, "dish_id">;
}

/** Validate + translate a prep-task **update** body (partial). */
export function buildPrepTaskUpdate(body: JsonObject): PrepTaskUpdate {
  const issues: ValidationIssue[] = [];
  const fields = collectPrepTaskFields(body, issues);

  if (issues.length > 0) {
    throw new ValidationError(
      "One or more prep-task fields are invalid.",
      issues,
    );
  }
  if (Object.keys(fields).length === 0) {
    throw new ValidationError("At least one prep-task field is required.", [
      { field: "body", rule: "nonEmpty" },
    ]);
  }

  return fields;
}
