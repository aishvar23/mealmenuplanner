"use client";

/**
 * Browser-side fetch helpers for the owner Members page (MP-B-022). Thin wrappers
 * over same-origin `fetch` (the session rides the HTTP-only auth cookies), typed
 * against the shared `ProviderApiClient` so a contract change to a request/response
 * shape is a compile error here too. No transport assumptions beyond the uniform
 * `{ error }` envelope.
 */

import type {
  CreateProviderInviteRequest,
  CreateProviderInviteResult,
  MemberDto,
} from "@/packages/shared/provider";

async function errorMessage(res: Response, fallback: string): Promise<string> {
  try {
    const body = (await res.json()) as { error?: { message?: string } };
    return body.error?.message ?? fallback;
  } catch {
    return fallback;
  }
}

/** `POST /api/providers/{id}/invites` — invite a customer by email and/or phone. */
export async function createInvite(
  providerId: string,
  input: CreateProviderInviteRequest,
): Promise<CreateProviderInviteResult> {
  const res = await fetch(`/api/providers/${providerId}/invites`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    throw new Error(await errorMessage(res, "Couldn't create the invite."));
  }
  return res.json();
}

/** `GET /api/providers/{id}/members` — the current roster. */
export async function listMembers(providerId: string): Promise<MemberDto[]> {
  const res = await fetch(`/api/providers/${providerId}/members`, {
    headers: { accept: "application/json" },
  });
  if (!res.ok) {
    throw new Error(await errorMessage(res, "Couldn't load members."));
  }
  const body = (await res.json()) as { data: MemberDto[] };
  return body.data;
}

type MemberAction = "approve" | "reject" | "remove";

/** `POST .../members/{memberId}/{action}` — run a lifecycle transition. */
export async function memberAction(
  providerId: string,
  memberId: string,
  action: MemberAction,
): Promise<MemberDto> {
  const res = await fetch(
    `/api/providers/${providerId}/members/${memberId}/${action}`,
    { method: "POST" },
  );
  if (!res.ok) {
    throw new Error(await errorMessage(res, "Couldn't update the member."));
  }
  return res.json();
}
