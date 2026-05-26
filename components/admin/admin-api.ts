/**
 * Client-side fetch helpers for the operator-console API (`/api/admin/...`).
 * Each wraps a route handler, parses the JSON, and throws {@link AdminApiError}
 * (carrying the standard error envelope's `code`/`message`/`details`) on a
 * non-2xx response so callers can surface a clean message and branch on `code`.
 */

import type { ErrorCode } from "@/lib/errors";
import type { CombinationDto } from "@/lib/services/admin/combinations";
import type {
  DishDetailDto,
  DishDto,
  DishIngredientDto,
  IngredientDto,
  PairingDto,
  PrepTaskDto,
} from "@/lib/services/admin/dto";

export class AdminApiError extends Error {
  readonly code: ErrorCode | string;
  readonly details: unknown;
  constructor(message: string, code: ErrorCode | string, details?: unknown) {
    super(message);
    this.name = "AdminApiError";
    this.code = code;
    this.details = details;
  }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: init?.body
      ? { "content-type": "application/json", ...init?.headers }
      : init?.headers,
  });

  // 2xx with no body (none of these endpoints) would break .json(); all admin
  // endpoints return a body, so parse defensively and fall back to null.
  const body = (await res.json().catch(() => null)) as unknown;

  if (!res.ok) {
    const envelope = (
      body as { error?: { code?: string; message?: string; details?: unknown } }
    )?.error;
    throw new AdminApiError(
      envelope?.message ?? "Something went wrong.",
      envelope?.code ?? "INTERNAL",
      envelope?.details,
    );
  }
  return body as T;
}

function json(method: string, body?: unknown): RequestInit {
  return {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
  };
}

// ───────────────────────────────── dishes ─────────────────────────────────

export function createDish(body: Record<string, unknown>): Promise<DishDto> {
  return request<DishDto>("/api/admin/dishes", json("POST", body));
}

export function getDishDetail(dishId: string): Promise<DishDetailDto> {
  return request<DishDetailDto>(`/api/admin/dishes/${dishId}`);
}

export function updateDish(
  dishId: string,
  body: Record<string, unknown>,
): Promise<DishDto> {
  return request<DishDto>(`/api/admin/dishes/${dishId}`, json("PATCH", body));
}

export function setDishStatus(
  dishId: string,
  status: string,
): Promise<DishDetailDto> {
  return request<DishDetailDto>(
    `/api/admin/dishes/${dishId}/status`,
    json("POST", { status }),
  );
}

// ──────────────────────────── dish ingredients ────────────────────────────

export function addDishIngredient(
  dishId: string,
  body: Record<string, unknown>,
): Promise<DishIngredientDto> {
  return request<DishIngredientDto>(
    `/api/admin/dishes/${dishId}/ingredients`,
    json("POST", body),
  );
}

export function updateDishIngredient(
  dishId: string,
  linkId: string,
  body: Record<string, unknown>,
): Promise<DishIngredientDto> {
  return request<DishIngredientDto>(
    `/api/admin/dishes/${dishId}/ingredients/${linkId}`,
    json("PATCH", body),
  );
}

export function removeDishIngredient(
  dishId: string,
  linkId: string,
): Promise<{ id: string; removed: true }> {
  return request(
    `/api/admin/dishes/${dishId}/ingredients/${linkId}`,
    json("DELETE"),
  );
}

// ─────────────────────────────── prep tasks ───────────────────────────────

export function addPrepTask(
  dishId: string,
  body: Record<string, unknown>,
): Promise<PrepTaskDto> {
  return request<PrepTaskDto>(
    `/api/admin/dishes/${dishId}/prep-tasks`,
    json("POST", body),
  );
}

export function removePrepTask(
  dishId: string,
  taskId: string,
): Promise<{ id: string; removed: true }> {
  return request(
    `/api/admin/dishes/${dishId}/prep-tasks/${taskId}`,
    json("DELETE"),
  );
}

// ──────────────────────────────── pairings ────────────────────────────────

export function addPairing(
  dishId: string,
  body: Record<string, unknown>,
): Promise<PairingDto> {
  return request<PairingDto>(
    `/api/admin/dishes/${dishId}/pairings`,
    json("POST", body),
  );
}

export function removePairing(
  dishId: string,
  pairingId: string,
): Promise<{ id: string; removed: true }> {
  return request(
    `/api/admin/dishes/${dishId}/pairings/${pairingId}`,
    json("DELETE"),
  );
}

// ─────────────────────────────── ingredients ───────────────────────────────

export function createIngredient(
  body: Record<string, unknown>,
): Promise<IngredientDto> {
  return request<IngredientDto>("/api/admin/ingredients", json("POST", body));
}

export function updateIngredient(
  ingredientId: string,
  body: Record<string, unknown>,
): Promise<IngredientDto> {
  return request<IngredientDto>(
    `/api/admin/ingredients/${ingredientId}`,
    json("PATCH", body),
  );
}

export function deleteIngredient(
  ingredientId: string,
): Promise<{ id: string; deleted: true }> {
  return request(`/api/admin/ingredients/${ingredientId}`, json("DELETE"));
}

// ───────────────────────────── combinations ─────────────────────────────

export function setCombinationStatus(
  combinationId: string,
  status: "active" | "rejected",
): Promise<CombinationDto> {
  return request<CombinationDto>(
    `/api/admin/combinations/${combinationId}/status`,
    json("POST", { status }),
  );
}
