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
  EditMenuDayInput,
  MenuDayDto,
  UpdateMenuDayNoteInput,
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

/**
 * `PUT /api/provider-menu-days/{menuDayId}` — a STRUCTURAL edit of an existing menu day
 * (MP-A-012E + MP-A-121, ADR-7 = REVISION). When no member has responded the change applies
 * in place; once a response exists the server creates a new revision (rev N+1) and asks the
 * affected members to re-confirm. Returns the resulting live `MenuDayDto`. Reuses the merged
 * edit writer (PR #59).
 */
export async function reviseMenuDay(
  menuDayId: string,
  input: EditMenuDayInput,
): Promise<MenuDayDto> {
  const res = await fetch(`/api/provider-menu-days/${menuDayId}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    throw new Error(await readApiErrorMessage(res, "Couldn't save the menu."));
  }
  return res.json();
}

/**
 * `PATCH /api/provider-menu-days/{menuDayId}` — a NON-STRUCTURAL note edit, applied IN
 * PLACE regardless of member responses (never a revision; ADR-7). Returns the updated live
 * `MenuDayDto`. Reuses the merged note writer (PR #59 / `update_provider_menu_day_note`).
 */
export async function updateMenuDayNote(
  menuDayId: string,
  input: UpdateMenuDayNoteInput,
): Promise<MenuDayDto> {
  const res = await fetch(`/api/provider-menu-days/${menuDayId}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    throw new Error(await readApiErrorMessage(res, "Couldn't save the note."));
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
