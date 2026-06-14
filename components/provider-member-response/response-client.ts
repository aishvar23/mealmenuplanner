"use client";

/**
 * Browser-side fetch helpers for the member Today's Menu + response page
 * (MP-B-040/041). Same-origin `fetch` (auth rides the HTTP-only cookies), typed
 * against the shared `ProviderApiClient` so a contract change to a request/response
 * shape is a compile error here. The server DERIVES quantities and enforces the
 * cutoff/lock/version rules (MP-A-130) — these wrappers only carry the contract
 * body and surface the uniform `{ error }` envelope.
 *
 * A stale optimistic-concurrency save is a `409` with `details.reason ==
 * "stale_version"`; `saveMyResponse` rethrows a typed `StaleResponseError` so the
 * view can reload the authoritative response instead of showing a generic message.
 */

import { readApiErrorMessage } from "@/packages/shared/provider";
import type {
  MemberResponseDto,
  SaveProviderResponseRequest,
} from "@/packages/shared/provider";

/** Thrown when a save loses the optimistic-concurrency race (reason `stale_version`). */
export class StaleResponseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StaleResponseError";
  }
}

/** `GET /api/provider-menu-days/{menuDayId}/my-response` — the caller's response. */
export async function getMyResponse(
  menuDayId: string,
): Promise<MemberResponseDto> {
  const res = await fetch(`/api/provider-menu-days/${menuDayId}/my-response`, {
    headers: { accept: "application/json" },
  });
  if (!res.ok) {
    throw new Error(
      await readApiErrorMessage(res, "Couldn't load your response."),
    );
  }
  return res.json();
}

/** `PUT /api/provider-menu-days/{menuDayId}/my-response` — save selections. */
export async function saveMyResponse(
  menuDayId: string,
  body: SaveProviderResponseRequest,
): Promise<MemberResponseDto> {
  const res = await fetch(`/api/provider-menu-days/${menuDayId}/my-response`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    // A 409 stale-version conflict is recoverable by reloading, so surface it as a
    // distinct type the view can branch on (UC-RESPONSE-008, optimistic concurrency).
    if (res.status === 409) {
      const reason = await readConflictReason(res.clone());
      if (reason === "stale_version") {
        throw new StaleResponseError(
          await readApiErrorMessage(res, "Your response changed elsewhere."),
        );
      }
    }
    throw new Error(
      await readApiErrorMessage(res, "Couldn't save your response."),
    );
  }
  return res.json();
}

/** `POST /api/provider-responses/{responseId}/confirm`. */
export async function confirmResponse(
  responseId: string,
): Promise<MemberResponseDto> {
  const res = await fetch(`/api/provider-responses/${responseId}/confirm`, {
    method: "POST",
  });
  if (!res.ok) {
    throw new Error(
      await readApiErrorMessage(res, "Couldn't confirm your response."),
    );
  }
  return res.json();
}

/** `POST /api/provider-responses/{responseId}/cancel`. */
export async function cancelResponse(
  responseId: string,
): Promise<MemberResponseDto> {
  const res = await fetch(`/api/provider-responses/${responseId}/cancel`, {
    method: "POST",
  });
  if (!res.ok) {
    throw new Error(
      await readApiErrorMessage(res, "Couldn't cancel your response."),
    );
  }
  return res.json();
}

/** Best-effort read of the `details.reason` discriminator off a conflict envelope. */
async function readConflictReason(res: Response): Promise<string | null> {
  try {
    const body = (await res.json()) as {
      error?: { details?: { reason?: string } };
    };
    return body.error?.details?.reason ?? null;
  } catch {
    return null;
  }
}
