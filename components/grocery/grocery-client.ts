"use client";

/**
 * Browser-side fetch helpers for the grocery endpoints (P7-2/P7-3). Thin wrappers
 * over `fetch` so the grocery board has one place that knows the URLs + shapes.
 * The session travels in the HTTP-only auth cookies the proxy refreshes, so these
 * are plain same-origin requests. Response DTO types come from the service's pure
 * `dto` module (`import type` is erased, so no server-only module reaches the bundle).
 */

import type {
  GroceryItemDto,
  GroceryListDto,
} from "@/lib/services/grocery/dto";

/** A failed grocery request mapped to the standard error envelope's message. */
export class GroceryRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
    this.name = "GroceryRequestError";
  }
}

async function send<T>(
  url: string,
  method: "POST" | "PATCH",
  body?: unknown,
): Promise<T> {
  const res = await fetch(url, {
    method,
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
    throw new GroceryRequestError(message, res.status, code);
  }

  return (await res.json()) as T;
}

export function regenerateGroceryList(
  householdId: string,
  mealPlanId: string,
): Promise<GroceryListDto> {
  return send(
    `/api/households/${householdId}/grocery-list/regenerate`,
    "POST",
    {
      mealPlanId,
    },
  );
}

export function setItemChecked(
  groceryListItemId: string,
  checked: boolean,
): Promise<GroceryItemDto> {
  return send(`/api/grocery-list-items/${groceryListItemId}`, "PATCH", {
    checked,
  });
}
