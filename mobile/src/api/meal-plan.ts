import { apiRequest } from "./client";
import type {
  CandidatesResult,
  DayPlan,
  FeedbackType,
  MealPlanItem,
  MealSlot,
  RejectResult,
  ReplaceResult,
  TodayGenerateResult,
  WeekGenerateResult,
  WeekPlan,
} from "./types";

/**
 * Meal-plan endpoints (design/10 § 6). Reads (`getDayPlan` / `getWeekPlan`) hit
 * the GET routes the mobile build added; generation sends a reusable
 * `Idempotency-Key` so a flaky-network retry replays instead of duplicating
 * (design/04 § 3). Per-item actions mirror `components/meal-plan/meal-plan-client`.
 */

const householdBase = (householdId: string) =>
  `/api/households/${householdId}/meal-plans`;

const itemUrl = (id: string, action: string) =>
  `/api/meal-plan-items/${id}/${action}`;

// ───────────────────────────── reads ─────────────────────────────

export function getDayPlan(
  householdId: string,
  date: string,
): Promise<DayPlan> {
  return apiRequest<DayPlan>(`${householdBase(householdId)}/today`, {
    query: { date },
  });
}

export function getWeekPlan(
  householdId: string,
  startDate: string,
  endDate: string,
): Promise<WeekPlan> {
  return apiRequest<WeekPlan>(`${householdBase(householdId)}/week`, {
    query: { startDate, endDate },
  });
}

// ─────────────────────────── generation ───────────────────────────

export function generateToday(
  householdId: string,
  date: string,
  mealSlot: MealSlot,
  idempotencyKey: string,
): Promise<TodayGenerateResult> {
  return apiRequest<TodayGenerateResult>(
    `${householdBase(householdId)}/today/generate`,
    {
      method: "POST",
      body: { date, mealSlot },
      idempotencyKey,
    },
  );
}

export function generateWeek(
  householdId: string,
  startDate: string,
  endDate: string,
  idempotencyKey: string,
): Promise<WeekGenerateResult> {
  return apiRequest<WeekGenerateResult>(
    `${householdBase(householdId)}/week/generate`,
    {
      method: "POST",
      body: { startDate, endDate },
      idempotencyKey,
    },
  );
}

// ───────────────────────── per-item actions ─────────────────────────

export function acceptItem(id: string): Promise<MealPlanItem> {
  return apiRequest<MealPlanItem>(itemUrl(id, "accept"), { method: "POST" });
}

export function rejectItem(
  id: string,
  input: { feedbackType: FeedbackType; reason?: string | null },
): Promise<RejectResult> {
  return apiRequest<RejectResult>(itemUrl(id, "reject"), {
    method: "POST",
    body: input,
  });
}

export function replaceItem(
  id: string,
  input: { replacementDishId?: string | null; reason?: string | null },
): Promise<ReplaceResult> {
  return apiRequest<ReplaceResult>(itemUrl(id, "replace"), {
    method: "POST",
    body: input,
  });
}

export function suggestAnother(id: string): Promise<TodayGenerateResult> {
  return apiRequest<TodayGenerateResult>(itemUrl(id, "suggest-another"), {
    method: "POST",
  });
}

export function slotCandidates(id: string): Promise<CandidatesResult> {
  return apiRequest<CandidatesResult>(itemUrl(id, "candidates"));
}

export function lockItem(id: string): Promise<MealPlanItem> {
  return apiRequest<MealPlanItem>(itemUrl(id, "lock"), { method: "POST" });
}

export function unlockItem(id: string): Promise<MealPlanItem> {
  return apiRequest<MealPlanItem>(itemUrl(id, "unlock"), { method: "POST" });
}

export function markEatingOut(
  id: string,
  note?: string | null,
): Promise<MealPlanItem> {
  return apiRequest<MealPlanItem>(itemUrl(id, "eating-out"), {
    method: "POST",
    body: { note: note ?? null },
  });
}

export function markCooked(id: string): Promise<MealPlanItem> {
  return apiRequest<MealPlanItem>(itemUrl(id, "cooked"), { method: "POST" });
}
