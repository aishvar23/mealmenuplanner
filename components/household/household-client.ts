"use client";

/**
 * Browser-side fetch helpers for the household collaboration endpoints (P6).
 * Thin wrappers over `fetch` so the members UI has one place that knows the URLs
 * and response shapes. The session travels in the HTTP-only auth cookies the
 * proxy refreshes, so these are plain same-origin requests.
 *
 * Response DTO types come from the services' pure `dto` modules (`import type` is
 * erased at build, so no server-only module is pulled into the bundle).
 */

import type {
  LeaveHouseholdResult,
  MemberDto,
  RemoveMemberResult,
} from "@/lib/services/household/dto";
import type { CreateInviteResult } from "@/lib/services/invite/dto";

/** A failed request mapped to the standard error envelope's message + code. */
export class HouseholdRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
    this.name = "HouseholdRequestError";
  }
}

async function sendJson<T>(
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
    throw new HouseholdRequestError(message, res.status, code);
  }

  return (await res.json()) as T;
}

/** The create-invite request body (a subset of design/04 § 4.3). */
export interface CreateInviteInput {
  email?: string;
  phone?: string;
  role?: string;
  membershipType?: string;
  expiresAt?: string;
  permissions?: Record<string, boolean>;
}

export function createInvite(
  householdId: string,
  input: CreateInviteInput,
): Promise<CreateInviteResult> {
  return sendJson(`/api/households/${householdId}/invites`, "POST", input);
}

export function updateMember(
  householdId: string,
  memberId: string,
  input: { role?: string } & Record<string, unknown>,
): Promise<MemberDto> {
  return sendJson(
    `/api/households/${householdId}/members/${memberId}`,
    "PATCH",
    input,
  );
}

export function removeMember(
  householdId: string,
  memberId: string,
): Promise<RemoveMemberResult> {
  return sendJson(
    `/api/households/${householdId}/members/${memberId}/remove`,
    "POST",
  );
}

export function leaveHousehold(
  householdId: string,
): Promise<LeaveHouseholdResult> {
  return sendJson(`/api/households/${householdId}/leave`, "POST");
}
