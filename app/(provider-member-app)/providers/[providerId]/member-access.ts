import "server-only";

import { redirect } from "next/navigation";

import { getAuthUser } from "@/lib/auth";
import { resolveCustomerAccess } from "@/lib/services/workspace";
import type { ProviderSummaryDto } from "@/packages/shared/provider";

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
 * holding screen — the only place an awaiting member can be.
 */
export async function requireActiveMember(
  providerId: string,
): Promise<ProviderSummaryDto> {
  const membership = await requireMember(providerId);
  if (membership.membershipStatus !== "active") {
    redirect(`/providers/${providerId}/awaiting-approval`);
  }
  return membership;
}
