import { apiRequest, getCollection } from "./client";
import type {
  AcceptInviteResult,
  CreateInviteInput,
  CreateInviteResult,
  DeclineInviteResult,
  InvitePreview,
  PendingInvite,
} from "./types";

/**
 * Invite endpoints (design/04 § 4.3, design/07 § 6). Inviters create + list
 * pending invites under a household; an invitee previews a token (unauthenticated)
 * and accepts / declines it. The plaintext token rides the `inviteLink` returned
 * once on create — pending rows never expose a re-shareable link.
 */

/**
 * `POST /api/households/{id}/invites` — create an invite (gated by
 * `can_invite_members`). Returns the shareable link (shown once).
 */
export function createInvite(
  householdId: string,
  input: CreateInviteInput,
): Promise<CreateInviteResult> {
  return apiRequest<CreateInviteResult>(
    `/api/households/${householdId}/invites`,
    { method: "POST", body: input },
  );
}

/**
 * `GET /api/households/{id}/invites` — the household's pending invites (additive
 * read for mobile). Empty for a member without `can_invite_members`.
 */
export async function listPendingInvites(
  householdId: string,
): Promise<PendingInvite[]> {
  const { data } = await getCollection<PendingInvite>(
    `/api/households/${householdId}/invites`,
  );
  return data;
}

/** `GET /api/invites/{token}` — unauthenticated preview of a pending invite. */
export function getInvitePreview(token: string): Promise<InvitePreview> {
  return apiRequest<InvitePreview>(`/api/invites/${encodeURIComponent(token)}`);
}

/** `POST /api/invites/{token}/accept` — redeem an invite (creates membership). */
export function acceptInvite(token: string): Promise<AcceptInviteResult> {
  return apiRequest<AcceptInviteResult>(
    `/api/invites/${encodeURIComponent(token)}/accept`,
    { method: "POST" },
  );
}

/** `POST /api/invites/{token}/decline` — decline an invite (no membership). */
export function declineInvite(token: string): Promise<DeclineInviteResult> {
  return apiRequest<DeclineInviteResult>(
    `/api/invites/${encodeURIComponent(token)}/decline`,
    { method: "POST" },
  );
}
