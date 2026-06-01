/**
 * Request validation for the `mealPlan` service (design/04 § 4.5, design/08 § 2,
 * § 3, § 5) — pure and I/O-free so each service just calls it and the rules are
 * unit-testable in isolation. Mirrors the `meal_plans` / `meal_plan_items`
 * schema (doc 01): calendar dates are real `YYYY-MM-DD` days, `mealSlot` is a
 * `meal_slot` enum value, and `feedbackType` is a `feedback_type` enum value
 * (both from the generated `Constants` so they can't drift).
 *
 * Calendar-date helpers are shared with the recommendation service
 * (`isCalendarDate`, `subtractDays`) — imported from its pure validate module so
 * there is exactly one definition of "is this a real date".
 */

import { Constants } from "@/lib/db/database.types";
import type { Database } from "@/lib/db/database.types";
import { ValidationError } from "@/lib/errors";
import type { JsonObject } from "@/lib/http";
import {
  isCalendarDate,
  validateSlotRequest,
  type MealSlot,
  type SlotRequest,
} from "@/lib/services/recommendation/validate";
import { isUuid } from "@/lib/validation";

export type { MealSlot, SlotRequest };
export { isCalendarDate };

export type FeedbackType = Database["public"]["Enums"]["feedback_type"];

const FEEDBACK_TYPES = Constants.public.Enums.feedback_type;

/** Hard cap on a single weekly-generate range (doc 08 § 3 plans ~7 days). */
export const MAX_PLAN_RANGE_DAYS = 31;

/** A validated weekly-generate range. */
export interface WeekRequest {
  startDate: string;
  endDate: string;
}

/** A validated replace request (design/08 § 5). */
export interface ReplaceRequest {
  /** Caller-chosen replacement; null/absent means "let the recommender pick". */
  replacementDishId: string | null;
  /** Human note stored on the item + (with a feedbackType) recorded as feedback. */
  reason: string | null;
  /** Optional rejection feedback recorded before the swap. */
  feedbackType: FeedbackType | null;
}

/** A validated reject request (design/08 § 2 "Reject with reason"). */
export interface RejectRequest {
  feedbackType: FeedbackType;
  reason: string | null;
}

/** Max length of an eating-out place note — mirrors the `eating_out_note` CHECK. */
export const EATING_OUT_NOTE_MAX_LENGTH = 200;

/** A validated eating-out request (BETA). The optional place note is the only field. */
export interface EatingOutRequest {
  /** Trimmed place note, or null to clear it. */
  note: string | null;
}

/** Validate `{ date, mealSlot }` for today's generation — reuses the slot validator. */
export function validateTodayRequest(body: JsonObject): SlotRequest {
  return validateSlotRequest(body.date, body.mealSlot);
}

/**
 * Validate `{ startDate, endDate }` for weekly generation (design/04 § 4.5).
 * Both must be real calendar dates, `endDate >= startDate` (the
 * `plan_dates_ordered` check), and the span at most {@link MAX_PLAN_RANGE_DAYS}.
 */
export function validateWeekRequest(body: JsonObject): WeekRequest {
  const issues = [];
  const { startDate, endDate } = body;

  if (!isCalendarDate(startDate)) {
    issues.push({
      field: "startDate",
      rule: "date",
      message: "Expected YYYY-MM-DD.",
    });
  }
  if (!isCalendarDate(endDate)) {
    issues.push({
      field: "endDate",
      rule: "date",
      message: "Expected YYYY-MM-DD.",
    });
  }
  if (issues.length > 0) {
    throw new ValidationError("Invalid weekly plan range.", issues);
  }

  const start = startDate as string;
  const end = endDate as string;
  if (end < start) {
    throw new ValidationError("Invalid weekly plan range.", [
      {
        field: "endDate",
        rule: "range",
        message: "endDate must be on or after startDate.",
      },
    ]);
  }
  if (daysBetweenInclusive(start, end) > MAX_PLAN_RANGE_DAYS) {
    throw new ValidationError("Invalid weekly plan range.", [
      {
        field: "endDate",
        rule: "max",
        max: MAX_PLAN_RANGE_DAYS,
        message: `A plan may span at most ${MAX_PLAN_RANGE_DAYS} days.`,
      },
    ]);
  }

  return { startDate: start, endDate: end };
}

/** Validate the optional replace body (design/08 § 5). All fields are optional. */
export function validateReplaceRequest(body: JsonObject): ReplaceRequest {
  const issues = [];

  let replacementDishId: string | null = null;
  if (body.replacementDishId != null) {
    if (
      typeof body.replacementDishId !== "string" ||
      !isUuid(body.replacementDishId)
    ) {
      issues.push({ field: "replacementDishId", rule: "uuid" });
    } else {
      replacementDishId = body.replacementDishId;
    }
  }

  const reason = parseOptionalReason(body.reason, issues);
  const feedbackType = parseOptionalFeedbackType(body.feedbackType, issues);

  if (issues.length > 0) {
    throw new ValidationError("Invalid replace request.", issues);
  }
  return { replacementDishId, reason, feedbackType };
}

/** Validate a reject body — `feedbackType` is required (design/08 § 2). */
export function validateRejectRequest(body: JsonObject): RejectRequest {
  const issues = [];

  let feedbackType: FeedbackType | null = null;
  if (
    typeof body.feedbackType !== "string" ||
    !(FEEDBACK_TYPES as readonly string[]).includes(body.feedbackType)
  ) {
    issues.push({
      field: "feedbackType",
      rule: "enum",
      allowed: FEEDBACK_TYPES,
    });
  } else {
    feedbackType = body.feedbackType as FeedbackType;
  }

  const reason = parseOptionalReason(body.reason, issues);

  if (issues.length > 0) {
    throw new ValidationError("Invalid reject request.", issues);
  }
  return { feedbackType: feedbackType as FeedbackType, reason };
}

/**
 * Validate the optional eating-out body (BETA). The body may be absent/empty (a
 * bare "eating out" with no place); `note` when present must be a string at most
 * {@link EATING_OUT_NOTE_MAX_LENGTH} chars. A blank/whitespace note becomes null.
 */
export function validateEatingOutRequest(body: JsonObject): EatingOutRequest {
  if (body.note == null) return { note: null };
  if (typeof body.note !== "string") {
    throw new ValidationError("Invalid eating-out note.", [
      { field: "note", rule: "type" },
    ]);
  }
  const trimmed = body.note.trim();
  if (trimmed.length > EATING_OUT_NOTE_MAX_LENGTH) {
    throw new ValidationError("Invalid eating-out note.", [
      { field: "note", rule: "maxLength", max: EATING_OUT_NOTE_MAX_LENGTH },
    ]);
  }
  return { note: trimmed.length > 0 ? trimmed : null };
}

/** Every `YYYY-MM-DD` from `startDate` to `endDate` inclusive (UTC, ordered). */
export function eachDateInRange(startDate: string, endDate: string): string[] {
  const dates: string[] = [];
  const endMs = Date.parse(`${endDate}T00:00:00Z`);
  let ms = Date.parse(`${startDate}T00:00:00Z`);
  while (ms <= endMs) {
    dates.push(new Date(ms).toISOString().slice(0, 10));
    ms += 86_400_000;
  }
  return dates;
}

/** Inclusive day count between two calendar dates (e.g. same day = 1). */
export function daysBetweenInclusive(
  startDate: string,
  endDate: string,
): number {
  const startMs = Date.parse(`${startDate}T00:00:00Z`);
  const endMs = Date.parse(`${endDate}T00:00:00Z`);
  return Math.round((endMs - startMs) / 86_400_000) + 1;
}

type Issues = { field: string; rule: string; [key: string]: unknown }[];

/** A trimmed non-empty reason string, or null; pushes an issue for a bad type. */
function parseOptionalReason(value: unknown, issues: Issues): string | null {
  if (value == null) return null;
  if (typeof value !== "string") {
    issues.push({ field: "reason", rule: "type" });
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** A valid `feedback_type` value, or null; pushes an issue for an unknown value. */
function parseOptionalFeedbackType(
  value: unknown,
  issues: Issues,
): FeedbackType | null {
  if (value == null) return null;
  if (
    typeof value !== "string" ||
    !(FEEDBACK_TYPES as readonly string[]).includes(value)
  ) {
    issues.push({
      field: "feedbackType",
      rule: "enum",
      allowed: FEEDBACK_TYPES,
    });
    return null;
  }
  return value as FeedbackType;
}
