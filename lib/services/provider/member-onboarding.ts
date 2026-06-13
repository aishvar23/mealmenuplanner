import "server-only";

import { requireAuthUser } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/db/server";
import {
  ForbiddenError,
  InternalError,
  NotFoundError,
  UnauthenticatedError,
  ValidationError,
} from "@/lib/errors";
import type { JsonObject } from "@/lib/http";
import type { MyProviderMembershipDto } from "@/packages/shared/provider";

import { validateMemberOnboarding } from "./invite-validation";

/**
 * Minimal member onboarding (MP-B-021/MP-C-021 backend, UC-MEMBER-ONBOARD-001).
 * The caller reads their OWN membership (RLS `pmem_select` own row) + subscription
 * (psub_select own row) to drive the onboarding gate and prefill; the write goes
 * through the `complete_member_onboarding` DEFINER RPC (pmem writes are RPC-only).
 * Captures ONLY provider-interaction data — never any household field.
 */

type SupabaseClient = Awaited<ReturnType<typeof createServerSupabaseClient>>;

/** Read the caller's own membership + subscription, mapped to the self DTO. */
async function readMyMembership(
  supabase: SupabaseClient,
  providerId: string,
  userId: string,
): Promise<MyProviderMembershipDto> {
  const { data: membership, error } = await supabase
    .from("provider_memberships")
    .select(
      "role, status, member_display_name, member_phone, default_spice_level, onboarding_completed_at",
    )
    .eq("provider_id", providerId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    throw new InternalError("Failed to load your membership.", {
      cause: error,
    });
  }
  if (!membership) {
    throw new NotFoundError("Provider not found.");
  }

  const { data: subscription, error: subError } = await supabase
    .from("provider_subscriptions")
    .select("auto_accept_enabled, auto_accept_consented_at")
    .eq("provider_id", providerId)
    .eq("customer_user_id", userId)
    .maybeSingle();
  if (subError) {
    throw new InternalError("Failed to load your subscription.", {
      cause: subError,
    });
  }

  return {
    providerId,
    role: membership.role,
    status: membership.status,
    onboardingComplete: membership.onboarding_completed_at !== null,
    displayName: membership.member_display_name,
    phone: membership.member_phone,
    defaultSpiceLevel: membership.default_spice_level,
    autoAcceptEligible: subscription !== null,
    autoAcceptConsented:
      subscription?.auto_accept_enabled === true &&
      subscription.auto_accept_consented_at !== null,
  };
}

/** `GET /api/providers/{id}/my-membership` — the caller's own membership state. */
export async function getMyProviderMembership(
  providerId: string,
): Promise<MyProviderMembershipDto> {
  const user = await requireAuthUser();
  const supabase = await createServerSupabaseClient();
  return readMyMembership(supabase, providerId, user.id);
}

/**
 * `POST /api/providers/{id}/complete-member-onboarding` — persist the minimal
 * member profile (active members only). Returns the refreshed membership so the
 * client can route on (now-complete) and reflect any captured consent.
 */
export async function completeMemberOnboarding(
  providerId: string,
  body: JsonObject,
): Promise<MyProviderMembershipDto> {
  const user = await requireAuthUser();
  const input = validateMemberOnboarding(body);

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.rpc("complete_member_onboarding", {
    p_provider_id: providerId,
    p_display_name: input.displayName,
    p_phone: input.phone,
    p_default_spice_level: input.defaultSpiceLevel,
    p_allergy_ack: input.allergyAck,
    p_terms_ack: input.termsAck,
    p_auto_accept_consent: input.autoAcceptConsent,
  });

  if (error) {
    if (error.code === "28000") throw new UnauthenticatedError();
    if (error.code === "42501") {
      throw new ForbiddenError(
        "Your membership must be approved before onboarding.",
        { details: { reason: "provider_approval_required" } },
      );
    }
    if (error.code === "23514") {
      throw new ValidationError("Some onboarding details are missing.", [
        { field: "allergyAck", rule: "required" },
        { field: "termsAck", rule: "required" },
      ]);
    }
    throw new InternalError("Failed to complete onboarding.", { cause: error });
  }

  return readMyMembership(supabase, providerId, user.id);
}
