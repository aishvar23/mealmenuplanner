import "server-only";

import { requireAuthUser } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/db/server";
import { ConflictError, InternalError, NotFoundError } from "@/lib/errors";

import type { DeclineInviteResult } from "./dto";
import { hashInviteToken } from "./token";

const PG_NO_DATA_FOUND = "P0002"; // unknown token → 404
const PG_CHECK_VIOLATION = "23514"; // invite not pending / expired → 409

/**
 * `invite` service — decline invite (P6-3, design/04 § 4.3, design/07 § 4).
 *
 * Sets the invite `pending → declined` via the `decline_invite` SECURITY DEFINER
 * function (the invitee is not a member, so the `hi_update` RLS would otherwise
 * reject it). No membership row is created.
 */
export async function declineInvite(
  token: string,
): Promise<DeclineInviteResult> {
  await requireAuthUser();

  const trimmed = typeof token === "string" ? token.trim() : "";
  if (trimmed.length === 0) {
    throw new NotFoundError("This invite is not valid or has expired.");
  }

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.rpc("decline_invite", {
    p_token_hash: hashInviteToken(trimmed),
  });

  if (error) {
    if (error.code === PG_NO_DATA_FOUND) {
      throw new NotFoundError("This invite is not valid or has expired.", {
        cause: error,
      });
    }
    if (error.code === PG_CHECK_VIOLATION) {
      throw new ConflictError("This invite is no longer valid.", {
        reason: "invite_not_pending",
      });
    }
    throw new InternalError("Failed to decline invite.", { cause: error });
  }

  return { status: "declined" };
}
