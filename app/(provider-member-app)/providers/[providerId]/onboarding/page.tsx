import { MemberOnboardingView } from "@/components/provider-member-onboarding/onboarding-view";

import { requireMemberForOnboarding } from "../member-access";

export const metadata = { title: "Complete your details" };

/**
 * Minimal member onboarding page (MP-B-021, UC-MEMBER-ONBOARD-001). Reached when
 * an approved customer has not finished onboarding (the `requireActiveMember`
 * gate routes them here). `requireMemberForOnboarding` sends an already-onboarded
 * member back to Today, so this page is the single landing for a not-yet-onboarded
 * active member.
 */
export default async function ProviderMemberOnboardingPage({
  params,
}: {
  params: Promise<{ providerId: string }>;
}) {
  const { providerId } = await params;
  const { summary, membership } = await requireMemberForOnboarding(providerId);

  return (
    <MemberOnboardingView
      providerId={providerId}
      providerName={summary.name}
      membership={membership}
    />
  );
}
