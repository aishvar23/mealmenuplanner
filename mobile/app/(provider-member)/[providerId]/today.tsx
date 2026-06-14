import { useLocalSearchParams } from "expo-router";

import { ActiveMemberGuard } from "@/provider/active-member-guard";
import { TodayResponseScreen } from "@/provider/today-response-screen";

/**
 * Customer's Today's Menu + response (MP-C-040/041, spec §14.2/§14.3). The guard
 * keeps awaiting/un-onboarded customers on the holding screen; the screen renders
 * the published menu and the member's confirm / update / cancel flow against the
 * same `/api/*` routes the web app uses.
 */
export default function MemberTodayScreen() {
  const { providerId } = useLocalSearchParams<{ providerId: string }>();
  return (
    <ActiveMemberGuard providerId={providerId}>
      <TodayResponseScreen providerId={providerId} />
    </ActiveMemberGuard>
  );
}
