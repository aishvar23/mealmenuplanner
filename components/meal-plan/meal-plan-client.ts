"use client";

/**
 * Browser-side fetch helpers for the meal-plan endpoints (P5). Thin wrappers over
 * `fetch` so the Today and Plan boards share one place that knows the URLs and
 * response shapes. The session travels in the HTTP-only auth cookies the proxy
 * refreshes, so these are plain same-origin requests.
 *
 * Response DTO types come from the service's pure `dto` module (`import type` is
 * erased at build, so this never pulls a server-only module into the bundle).
 */

import type {
  MealPlanItemDto,
  RejectResult,
  ReplaceResult,
  TodayGenerateResult,
  WeekGenerateResult,
} from "@/lib/services/meal-plan/dto";

/** A failed request mapped to the standard error envelope's message. */
export class MealPlanRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
    this.name = "MealPlanRequestError";
  }
}

async function postJson<T>(url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: body === undefined ? {} : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });

  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    let code: string | undefined;
    try {
      const envelope = (await res.json()) as {
        error?: { message?: string; code?: string };
      };
      message = envelope.error?.message ?? message;
      code = envelope.error?.code;
    } catch {
      // Non-JSON body — keep the status-derived message.
    }
    throw new MealPlanRequestError(message, res.status, code);
  }

  return (await res.json()) as T;
}

export function generateToday(
  householdId: string,
  date: string,
  mealSlot: string,
): Promise<TodayGenerateResult> {
  return postJson(`/api/households/${householdId}/meal-plans/today/generate`, {
    date,
    mealSlot,
  });
}

export function generateWeek(
  householdId: string,
  startDate: string,
  endDate: string,
): Promise<WeekGenerateResult> {
  return postJson(`/api/households/${householdId}/meal-plans/week/generate`, {
    startDate,
    endDate,
  });
}

const itemUrl = (id: string, action: string) =>
  `/api/meal-plan-items/${id}/${action}`;

export function acceptItem(id: string): Promise<MealPlanItemDto> {
  return postJson(itemUrl(id, "accept"));
}

export function suggestAnother(id: string): Promise<TodayGenerateResult> {
  return postJson(itemUrl(id, "suggest-another"));
}

export function rejectItem(
  id: string,
  input: { feedbackType: string; reason?: string | null },
): Promise<RejectResult> {
  return postJson(itemUrl(id, "reject"), input);
}

export function replaceItem(
  id: string,
  input: { replacementDishId?: string | null; reason?: string | null },
): Promise<ReplaceResult> {
  return postJson(itemUrl(id, "replace"), input);
}

export function markEatingOut(id: string): Promise<MealPlanItemDto> {
  return postJson(itemUrl(id, "eating-out"));
}

export function lockItem(id: string): Promise<MealPlanItemDto> {
  return postJson(itemUrl(id, "lock"));
}

export function unlockItem(id: string): Promise<MealPlanItemDto> {
  return postJson(itemUrl(id, "unlock"));
}

export function markCooked(id: string): Promise<MealPlanItemDto> {
  return postJson(itemUrl(id, "cooked"));
}
