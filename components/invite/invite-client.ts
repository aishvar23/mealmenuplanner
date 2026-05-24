"use client";

/**
 * Browser-side fetch helpers for the invite accept/decline endpoints (P6-3),
 * used by the public invite landing page. Same-origin requests carrying the
 * auth cookie; a `401` means the visitor must sign in before accepting.
 */

import type {
  AcceptInviteResult,
  DeclineInviteResult,
} from "@/lib/services/invite/dto";

export class InviteRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
    this.name = "InviteRequestError";
  }
}

async function post<T>(url: string): Promise<T> {
  const res = await fetch(url, { method: "POST", cache: "no-store" });
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
    throw new InviteRequestError(message, res.status, code);
  }
  return (await res.json()) as T;
}

export function acceptInvite(token: string): Promise<AcceptInviteResult> {
  return post(`/api/invites/${encodeURIComponent(token)}/accept`);
}

export function declineInvite(token: string): Promise<DeclineInviteResult> {
  return post(`/api/invites/${encodeURIComponent(token)}/decline`);
}
