"use client";

/**
 * Browser-side fetch helpers for the owner Menu builder (MP-B-030). Thin wrappers over
 * same-origin `fetch` (the session rides the HTTP-only auth cookies), typed against the
 * shared `ProviderApiClient` contract so a request/response shape change is a compile
 * error here too. The weekly menu + catalog reads happen server-side (the page is a
 * server component); only the owner mutations — author a draft day and publish it — go
 * through here. Reuses the merged writers (PR #58 create / #57 publish).
 */

import { readApiErrorMessage } from "@/packages/shared/provider";
import type {
  CreateMenuDayInput,
  MenuDayDto,
} from "@/packages/shared/provider";

/** `POST /api/providers/{providerId}/menus` — author a new DRAFT menu day. */
export async function createMenuDay(
  providerId: string,
  input: CreateMenuDayInput,
): Promise<MenuDayDto> {
  const res = await fetch(`/api/providers/${providerId}/menus`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    throw new Error(
      await readApiErrorMessage(res, "Couldn't create the menu."),
    );
  }
  return res.json();
}

/** `POST /api/provider-menu-days/{menuDayId}/publish` — publish a draft menu day. */
export async function publishMenuDay(menuDayId: string): Promise<MenuDayDto> {
  const res = await fetch(`/api/provider-menu-days/${menuDayId}/publish`, {
    method: "POST",
  });
  if (!res.ok) {
    throw new Error(
      await readApiErrorMessage(res, "Couldn't publish the menu."),
    );
  }
  return res.json();
}
