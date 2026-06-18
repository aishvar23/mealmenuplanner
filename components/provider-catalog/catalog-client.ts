"use client";

/**
 * Browser-side fetch helpers for the owner Catalog manager (ADO #88). Thin wrappers
 * over same-origin `fetch` (the session rides the HTTP-only auth cookies), typed
 * against the shared catalog DTOs so a request/response shape change is a compile
 * error here too. Reuses the existing catalog backend (MP-A-110) — no new routes.
 */

import { readApiErrorMessage } from "@/packages/shared/provider";
import type {
  CatalogItemDto,
  CreateCatalogItemRequest,
  UpdateCatalogItemRequest,
} from "@/packages/shared/provider";

/** `POST /api/providers/{providerId}/catalog` — add a catalog item. */
export async function createCatalogItem(
  providerId: string,
  input: CreateCatalogItemRequest,
): Promise<CatalogItemDto> {
  const res = await fetch(`/api/providers/${providerId}/catalog`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    throw new Error(
      await readApiErrorMessage(res, "Couldn't add the catalog item."),
    );
  }
  return res.json();
}

/** `PATCH /api/providers/{providerId}/catalog/{catalogItemId}` — edit or archive/restore. */
export async function updateCatalogItem(
  providerId: string,
  catalogItemId: string,
  patch: UpdateCatalogItemRequest,
): Promise<CatalogItemDto> {
  const res = await fetch(
    `/api/providers/${providerId}/catalog/${catalogItemId}`,
    {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(patch),
    },
  );
  if (!res.ok) {
    throw new Error(
      await readApiErrorMessage(res, "Couldn't update the catalog item."),
    );
  }
  return res.json();
}
