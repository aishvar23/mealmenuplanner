import "server-only";

import { redirect } from "next/navigation";

import { getAuthUser } from "@/lib/auth";
import { getMyProviderMembership } from "@/lib/services/provider";
import { resolveCustomerAccess } from "@/lib/services/workspace";
import type {
  MyProviderMembershipDto,
  ProviderSummaryDto,
} from "@/packages/shared/provider";

/**
 * Access guards for the provider member shell (MP-B-012). Centralizes the
 * "who can see this provider" decision so every member page enforces it the same
 * way — the RLS client already hides cross-provider rows, so a customer of
 * Provider A asking about Provider B resolves to no membership and is bounced.
 */

/** Require a live (active or awaiting) customer membership of `providerId`. */
export async function requireMember(
  providerId: string,
): Promise<ProviderSummaryDto> {
  const user = await getAuthUser();
  if (!user) {
    redirect("/sign-in");
  }
  const membership = await resolveCustomerAccess(providerId);
  if (!membership) {
    // Not a customer of this provider (or not a member at all) — send them to the
    // chooser, which routes a user who belongs to nothing on to onboarding.
    redirect("/workspace");
  }
  return membership;
}

/**
 * Require an *approved* customer for the menu-bearing pages. An awaiting-approval
 * customer has no menu access yet (spec §14.4), so they are redirected to the
 * holding screen; an approved customer who has not finished minimal onboarding is
 * routed there first (UC-MEMBER-ONBOARD-001) — the menu pages are reachable only
 * after both gates pass.
 */
export async function requireActiveMember(
  providerId: string,
): Promise<ProviderSummaryDto> {
  const membership = await requireMember(providerId);
  if (membership.membershipStatus !== "active") {
    redirect(`/providers/${providerId}/awaiting-approval`);
  }
  const self = await getMyProviderMembership(providerId);
  if (!self.onboardingComplete) {
    redirect(`/providers/${providerId}/onboarding`);
  }
  return membership;
}

/**
 * Gate for the member-onboarding page itself: require an approved customer (an
 * awaiting one is bounced to the holding screen), but DO NOT redirect to
 * onboarding — instead send an already-onboarded member on to their Today's Menu,
 * so the onboarding page is the one place a not-yet-onboarded active member lands.
 */
export async function requireMemberForOnboarding(providerId: string): Promise<{
  summary: ProviderSummaryDto;
  membership: MyProviderMembershipDto;
}> {
  const summary = await requireMember(providerId);
  if (summary.membershipStatus !== "active") {
    redirect(`/providers/${providerId}/awaiting-approval`);
  }
  const membership = await getMyProviderMembership(providerId);
  if (membership.onboardingComplete) {
    redirect(`/providers/${providerId}/today`);
  }
  // Return the membership we just read so the page renders without a second
  // getMyProviderMembership round-trip.
  return { summary, membership };
}
