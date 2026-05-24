import "server-only";

import { requireAuthUser } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/db/server";
import {
  actorDisplayName,
  formatShortDate,
  safeEmitHouseholdEvent,
} from "@/lib/events";
import { ConflictError, InternalError, NotFoundError } from "@/lib/errors";

import type { AcceptInviteResult } from "./dto";
import { hashInviteToken } from "./token";

/** Postgres error codes the accept_invite RPC raises (P6-2/3 migration). */
const PG_NO_DATA_FOUND = "P0002"; // unknown token → 404
const PG_CHECK_VIOLATION = "23514"; // invite not pending / expired → 409
const PG_UNIQUE_VIOLATION = "23505"; // uq_one_live_membership → already a member

interface AcceptRpcResult {
  householdId: string;
  membershipStatus: string;
}

/**
 * `invite` service — accept invite (P6-3, design/04 § 4.3, design/07 § 6).
 *
 * The all-or-nothing redemption is the `accept_invite` SECURITY DEFINER function:
 * it sets the invite `pending → accepted` and inserts the `active`
 * `household_members` row (role / membership type / permissions / window from the
 * invite) in one transaction, so the token cannot be redeemed twice and there is
 * no window where the invite is consumed but the member is not active. This
 * service threads the call and maps the SQL error codes to typed domain errors.
 *
 * A non-existent token reads as `NotFoundError` (no oracle, matching the
 * preview); an already-redeemed/expired invite or a caller who already holds a
 * live membership is a `ConflictError` (design/04 § 4.3).
 */
export async function acceptInvite(token: string): Promise<AcceptInviteResult> {
  // A verified session is required (the acceptor); gives a clean 401 rather than
  // the RPC's 28000 backstop.
  const user = await requireAuthUser();

  const trimmed = typeof token === "string" ? token.trim() : "";
  if (trimmed.length === 0) {
    throw new NotFoundError("This invite is not valid or has expired.");
  }

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("accept_invite", {
    p_token_hash: hashInviteToken(trimmed),
  });

  if (error) {
    if (error.code === PG_NO_DATA_FOUND) {
      throw new NotFoundError("This invite is not valid or has expired.", {
        cause: error,
      });
    }
    if (error.code === PG_UNIQUE_VIOLATION) {
      throw new ConflictError("You are already a member of this household.", {
        reason: "already_member",
      });
    }
    if (error.code === PG_CHECK_VIOLATION) {
      throw new ConflictError("This invite is no longer valid.", {
        reason: "invite_not_pending",
      });
    }
    throw new InternalError("Failed to accept invite.", { cause: error });
  }

  const result = data as AcceptRpcResult | null;
  if (!result?.householdId) {
    throw new InternalError("Accepting the invite returned no household.");
  }

  // The caller is now an active member, so the fan-out tenancy guard passes and
  // they are excluded as the actor — the existing members get "X joined …".
  const [{ data: household }, { data: membership }] = await Promise.all([
    supabase
      .from("households")
      .select("name")
      .eq("id", result.householdId)
      .maybeSingle(),
    supabase
      .from("household_members")
      .select("membership_type, expires_at")
      .eq("household_id", result.householdId)
      .eq("user_id", user.id)
      .eq("status", "active")
      .maybeSingle(),
  ]);

  const guestUntil =
    membership?.membership_type === "temporary_guest" && membership.expires_at
      ? formatShortDate(membership.expires_at)
      : null;

  await safeEmitHouseholdEvent(supabase, {
    householdId: result.householdId,
    eventType: "invite_accepted",
    entityType: "household_member",
    vars: {
      memberName: actorDisplayName(user),
      householdName: household?.name ?? "the household",
      guestUntil,
    },
  });

  return { householdId: result.householdId, membershipStatus: "active" };
}
