"use client";

/**
 * Browser-side fetch helpers for the provider meal-suggestion UI (MP-A-131). Same-origin
 * `fetch` (auth rides the HTTP-only cookies), typed against the shared `ProviderApiClient`
 * contract so a request/response shape change is a compile error here too. Reuses the
 * routes the backend already shipped (read foundation PR #64, write flows before that):
 *
 *   • `listSuggestions`         — `GET  /api/provider-menu-days/{menuDayId}/suggestions`
 *                                  (RLS-scoped: owner → all for the day, member → own)
 *   • `createSuggestion`        — `POST /api/provider-menu-days/{menuDayId}/suggestions`
 *   • `acceptSuggestionAsOption`— `POST /api/provider-suggestions/{id}/accept-as-option`
 *   • `rejectSuggestion`        — `POST /api/provider-suggestions/{id}/reject`
 *
 * The server is authoritative — it derives `provider_id`/author, rate-limits creation, and
 * gates resolution to the owner + pending rows. These wrappers only carry the contract body
 * and surface the uniform `{ error }` envelope message (rate-limit, not-pending, etc.).
 */

import { readApiErrorMessage } from "@/packages/shared/provider";
import type {
  CreateProviderSuggestionRequest,
  ProviderSuggestionDto,
  ResolveProviderSuggestionRequest,
} from "@/packages/shared/provider";

/** `GET /api/provider-menu-days/{menuDayId}/suggestions`. */
export async function listSuggestions(
  menuDayId: string,
): Promise<ProviderSuggestionDto[]> {
  const res = await fetch(`/api/provider-menu-days/${menuDayId}/suggestions`, {
    headers: { accept: "application/json" },
  });
  if (!res.ok) {
    throw new Error(
      await readApiErrorMessage(res, "Couldn't load the suggestions."),
    );
  }
  return res.json();
}

/** `POST /api/provider-menu-days/{menuDayId}/suggestions` — a member files a suggestion. */
export async function createSuggestion(
  menuDayId: string,
  body: CreateProviderSuggestionRequest,
): Promise<ProviderSuggestionDto> {
  const res = await fetch(`/api/provider-menu-days/${menuDayId}/suggestions`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(
      await readApiErrorMessage(res, "Couldn't send your suggestion."),
    );
  }
  return res.json();
}

/** `POST /api/provider-suggestions/{suggestionId}/accept-as-option` — owner accepts. */
export async function acceptSuggestion(
  suggestionId: string,
  body?: ResolveProviderSuggestionRequest,
): Promise<ProviderSuggestionDto> {
  return resolve(suggestionId, "accept-as-option", body);
}

/** `POST /api/provider-suggestions/{suggestionId}/reject` — owner rejects. */
export async function rejectSuggestion(
  suggestionId: string,
  body?: ResolveProviderSuggestionRequest,
): Promise<ProviderSuggestionDto> {
  return resolve(suggestionId, "reject", body);
}

async function resolve(
  suggestionId: string,
  action: "accept-as-option" | "reject",
  body?: ResolveProviderSuggestionRequest,
): Promise<ProviderSuggestionDto> {
  const res = await fetch(
    `/api/provider-suggestions/${suggestionId}/${action}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body ?? {}),
    },
  );
  if (!res.ok) {
    throw new Error(
      await readApiErrorMessage(res, "Couldn't update the suggestion."),
    );
  }
  return res.json();
}
