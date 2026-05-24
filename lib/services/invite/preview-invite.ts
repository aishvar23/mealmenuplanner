import "server-only";

import { createServerSupabaseClient } from "@/lib/db/server";
import { InternalError, NotFoundError } from "@/lib/errors";

import { toInvitePreviewDto, type InvitePreviewDto } from "./dto";
import { hashInviteToken } from "./token";

/**
 * `invite` service — unauthenticated invite preview (P6-2, design/04 § 4.3,
 * design/03 § 7).
 *
 * Called from the public landing page BEFORE the invitee signs in, so it can't
 * run under member-scoped RLS. It hashes the plaintext token and reads through
 * the `get_invite_preview` SECURITY DEFINER RPC, which returns ONLY the safe
 * projection (household name, inviter display name, membership type, role,
 * expiry) for a pending, unexpired invite — never the household id, roster,
 * email/phone, or the stored hash.
 *
 * Per design/03 § 7 the response gives **no existence oracle**: any unknown,
 * expired, accepted, declined, or cancelled token yields the same generic
 * `NotFoundError`. (This intentionally collapses the design/04 § 4.3 CONFLICT
 * reasons on the unauthenticated path to avoid token enumeration.)
 */
export async function getInvitePreview(
  token: string,
): Promise<InvitePreviewDto> {
  const trimmed = typeof token === "string" ? token.trim() : "";
  if (trimmed.length === 0) {
    throw new NotFoundError("This invite is not valid or has expired.");
  }

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("get_invite_preview", {
    p_token_hash: hashInviteToken(trimmed),
  });

  if (error) {
    throw new InternalError("Failed to load invite.", { cause: error });
  }

  const row = (data ?? [])[0];
  if (!row) {
    throw new NotFoundError("This invite is not valid or has expired.");
  }

  return toInvitePreviewDto(row);
}
