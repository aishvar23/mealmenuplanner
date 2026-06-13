import { useLocalSearchParams } from "expo-router";

import { MemberOnboardingScreen } from "@/provider/member-onboarding-screen";

/** Minimal member onboarding screen route (MP-C-021). */
export default function MemberOnboardingRoute() {
  const { providerId } = useLocalSearchParams<{ providerId: string }>();
  return <MemberOnboardingScreen providerId={providerId} />;
}
