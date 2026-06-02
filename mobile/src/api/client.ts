import type { Collection } from "@mmp/shared/types";

import { getAccessToken, refreshSession } from "@/auth/session";
import { API_BASE_URL } from "@/config";

import { ApiError, CLIENT_ERROR_CODES, toApiError } from "./errors";

/**
 * The typed HTTP client for the Next.js `/api/*` backend (design/10 § 4). A thin
 * `fetch` wrapper — not a generated SDK — that mirrors the web app's conventions:
 *
 * - **Auth:** injects `Authorization: Bearer <access_token>` on every call.
 * - **Envelope:** returns the parsed success body; `getCollection` returns the
 *   `{ data, page }` list envelope.
 * - **Errors:** maps the uniform error envelope to a typed `ApiError`. On a
 *   `401` it attempts one Supabase token refresh, then retries once.
 * - **Idempotency:** pass `idempotencyKey` for the generation endpoints; the
 *   caller reuses the same key on retry (see `./idempotency`).
 */

type QueryValue = string | number | boolean | null | undefined;

export interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  /** JSON request body; serialized automatically. */
  body?: unknown;
  /** Query-string params; nullish values are omitted. */
  query?: Record<string, QueryValue>;
  /** `Idempotency-Key` header for the generation endpoints. */
  idempotencyKey?: string;
  signal?: AbortSignal;
}

function buildUrl(path: string, query?: Record<string, QueryValue>): string {
  const base = `${API_BASE_URL}${path.startsWith("/") ? path : `/${path}`}`;
  if (!query) return base;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null) {
      params.append(key, String(value));
    }
  }
  const qs = params.toString();
  return qs ? `${base}?${qs}` : base;
}

async function rawRequest(
  path: string,
  options: RequestOptions,
  retriedAuth: boolean,
): Promise<Response> {
  const token = await getAccessToken();
  const headers: Record<string, string> = { Accept: "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
  }
  if (options.idempotencyKey) {
    headers["Idempotency-Key"] = options.idempotencyKey;
  }

  let response: Response;
  try {
    response = await fetch(buildUrl(path, options.query), {
      method: options.method ?? "GET",
      headers,
      body:
        options.body !== undefined ? JSON.stringify(options.body) : undefined,
      signal: options.signal,
    });
  } catch {
    throw new ApiError(
      CLIENT_ERROR_CODES.NETWORK_ERROR,
      "Network request failed. Check your connection and try again.",
      0,
    );
  }

  // One transparent refresh-and-retry on an expired/!invalid token.
  if (response.status === 401 && !retriedAuth) {
    const refreshed = await refreshSession();
    if (refreshed) {
      return rawRequest(path, options, true);
    }
  }

  return response;
}

/** Issue a request and return the parsed JSON body (typed by the caller). */
export async function apiRequest<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const response = await rawRequest(path, options, false);

  if (!response.ok) {
    throw await toApiError(response);
  }
  if (response.status === 204) {
    return undefined as T;
  }
  return (await response.json()) as T;
}

/** Issue a request to a collection endpoint and return its `{ data, page }`. */
export function getCollection<T>(
  path: string,
  options: RequestOptions = {},
): Promise<Collection<T>> {
  return apiRequest<Collection<T>>(path, options);
}
