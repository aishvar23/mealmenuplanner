/**
 * Request validation for the recommendation service (design/04 § 4.2) — pure and
 * I/O-free so it is unit-testable and the service just calls it. Validates the
 * caller-supplied `date` and `meal_slot` before any DB work, mirroring the
 * `meal_plan_items` schema (doc 01): `date` is a real `YYYY-MM-DD` calendar date
 * and `mealSlot` is a `meal_slot` enum value (from the generated `Constants` so
 * it can't drift).
 */

import { Constants } from "@/lib/db/database.types";
import type { Database } from "@/lib/db/database.types";
import { ValidationError } from "@/lib/errors";

export type MealSlot = Database["public"]["Enums"]["meal_slot"];

const MEAL_SLOTS = Constants.public.Enums.meal_slot;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** A validated slot request. */
export interface SlotRequest {
  date: string;
  mealSlot: MealSlot;
}

/** True when `value` is a real `YYYY-MM-DD` calendar date (round-trips exactly). */
export function isCalendarDate(value: unknown): value is string {
  if (typeof value !== "string" || !DATE_PATTERN.test(value)) return false;
  const ms = Date.parse(`${value}T00:00:00Z`);
  if (Number.isNaN(ms)) return false;
  // Reject normalized-away values like 2026-02-30 → 2026-03-02.
  return new Date(ms).toISOString().slice(0, 10) === value;
}

/** Validate `(date, mealSlot)`, or throw a single `ValidationError` (design/04 § 4.2). */
export function validateSlotRequest(
  date: unknown,
  mealSlot: unknown,
): SlotRequest {
  const issues = [];
  if (!isCalendarDate(date)) {
    issues.push({
      field: "date",
      rule: "date",
      message: "Expected YYYY-MM-DD.",
    });
  }
  if (
    typeof mealSlot !== "string" ||
    !(MEAL_SLOTS as readonly string[]).includes(mealSlot)
  ) {
    issues.push({ field: "mealSlot", rule: "enum", allowed: MEAL_SLOTS });
  }
  if (issues.length > 0) {
    throw new ValidationError("Invalid recommendation request.", issues);
  }
  return { date: date as string, mealSlot: mealSlot as MealSlot };
}

/** `date` shifted back `days` calendar days, as `YYYY-MM-DD` (UTC). */
export function subtractDays(date: string, days: number): string {
  const ms = Date.parse(`${date}T00:00:00Z`) - days * 86_400_000;
  return new Date(ms).toISOString().slice(0, 10);
}
