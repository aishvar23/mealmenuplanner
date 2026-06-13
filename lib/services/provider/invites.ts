import "server-only";

import { requireAuthUser } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/db/server";
import {
  ConflictError,
  InternalError,
  NotFoundError,
  UnauthenticatedError,
} from "@/lib/errors";
import { getEmailTransport } from "@/lib/events/notifier";
import type { JsonObject } from "@/lib/http";
import {
  generateInviteToken,
  hashInviteToken,
} from "@/lib/services/invite/token";
import type {
  AcceptProviderInviteResult,
  CreateProviderInviteResult,
  ProviderInviteEmailStatus,
  ProviderInvitePreviewDto,
} from "@/packages/shared/provider";

import { requireOwnedProvider } from "./access";
import { validateCreateProviderInvite } from "./invite-validation";

/**
 * Provider membership invites (MP-A-102, contract 03 § 8; ADR-5). Reuses the
 * household hashed-token security pattern verbatim (`lib/services/invite/token`):
 * a high-entropy plaintext is generated, only its sha256 is stored, and the
 * plaintext is returned once inside the link. Acceptance lands the customer in
 * `awaiting_approval` (not `active`) — the owner must approve them.
 */

/** Best-effort provider invite email. Honest status so the UI can offer resend. */
async function sendProviderInviteEmail(
  toEmail: string,
  providerName: string,
  inviteLink: string,
): Promise<ProviderInviteEmailStatus> {
  const transport = getEmailTransport();
  if (!transport) return "failed"; // unconfigured (dev) → prompt manual share
  try {
    await transport.send({
      to: toEmail,
      subject: `You're invited to order from ${providerName}`,
      html: `<p>${providerName} invited you to order meals through Home Meal Planner.</p><p><a href="${inviteLink}">Accept your invite</a></p>`,
      text: `${providerName} invited you to order meals through Home Meal Planner.\n\nAccept your invite: ${inviteLink}`,
    });
    return "sent";
  } catch (error) {
    console.error("[provider] failed to send invite email", { error });
    return "failed";
  }
}

/**
 * `POST /api/providers/{id}/invites` — create a hashed-token invite for a
 * customer (owner only). Returns the one-time link + email outcome. Owner gate is
 * explicit (existence-hiding) on top of the `pinv_insert` RLS backstop.
 */
export async function createProviderInvite(
  providerId: string,
  body: JsonObject,
  appBaseUrl: string,
): Promise<CreateProviderInviteResult> {
  const user = await requireAuthUser();
  await requireOwnedProvider(providerId);

  const invite = validateCreateProviderInvite(body);

  const plaintext = generateInviteToken();
  const tokenHash = hashInviteToken(plaintext);

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("provider_invites")
    .insert({
      provider_id: providerId,
      invited_by_user_id: user.id,
      invited_email: invite.invitedEmail,
      invited_phone: invite.invitedPhone,
      token_hash: tokenHash,
      status: "pending",
      expires_at: invite.expiresAt,
    })
    .select("id")
    .single();

  if (error || !data) {
    throw new InternalError("Failed to create the invite.", { cause: error });
  }

  const inviteLink = `${appBaseUrl.replace(/\/+$/, "")}/provider-invite/${plaintext}`;

  let emailStatus: ProviderInviteEmailStatus = "no_recipient";
  if (invite.invitedEmail) {
    const { data: org } = await supabase
      .from("provider_organizations")
      .select("name")
      .eq("id", providerId)
      .maybeSingle();
    emailStatus = await sendProviderInviteEmail(
      invite.invitedEmail,
      org?.name ?? "your meal provider",
      inviteLink,
    );
  }

  return { inviteId: data.id, inviteLink, emailStatus };
}

/**
 * `GET /api/provider-invites/{token}` — the safe, anon-readable invite preview.
 * Hashes the plaintext and calls the DEFINER projection RPC; an unknown / expired
 * / non-pending token resolves to `NotFoundError` (no existence leak).
 */
export async function previewProviderInvite(
  token: string,
): Promise<ProviderInvitePreviewDto> {
  const trimmed = token?.trim() ?? "";
  if (trimmed.length === 0) {
    throw new NotFoundError("This invite is not valid or has expired.");
  }

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("get_provider_invite_preview", {
    p_token_hash: hashInviteToken(trimmed),
  });
  if (error) {
    throw new InternalError("Failed to load the invite.", { cause: error });
  }
  const row = (data ?? [])[0];
  if (!row) {
    throw new NotFoundError("This invite is not valid or has expired.");
  }
  return {
    providerName: row.provider_name,
    invitedByName: row.invited_by,
    role: row.role,
    expiresAt: row.expires_at,
  };
}

/**
 * `POST /api/provider-invites/{token}/accept` — accept the invite as the signed-in
 * user, creating an `awaiting_approval` membership. Maps the RPC error codes:
 * P0002 → 404, 23514 → 409 `invite_not_pending`, 23505 → 409 `already_member`.
 */
export async function acceptProviderInvite(
  token: string,
): Promise<AcceptProviderInviteResult> {
  await requireAuthUser();
  const trimmed = token?.trim() ?? "";
  if (trimmed.length === 0) {
    throw new NotFoundError("This invite is not valid or has expired.");
  }

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("accept_provider_invite", {
    p_token_hash: hashInviteToken(trimmed),
  });

  if (error) {
    mapAcceptError(error);
  }

  const result = data as { providerId: string; membershipStatus: string };
  return {
    providerId: result.providerId,
    membershipStatus: "awaiting_approval",
  };
}

function mapAcceptError(error: { code?: string; cause?: unknown }): never {
  if (error.code === "28000") throw new UnauthenticatedError();
  if (error.code === "P0002") {
    throw new NotFoundError("This invite is not valid or has expired.", {
      cause: error,
    });
  }
  if (error.code === "23514") {
    throw new ConflictError("This invite is no longer valid.", {
      reason: "provider_invite_not_pending",
    });
  }
  if (error.code === "23505") {
    throw new ConflictError("You already belong to this provider.", {
      reason: "provider_already_member",
    });
  }
  throw new InternalError("Failed to accept the invite.", { cause: error });
}
