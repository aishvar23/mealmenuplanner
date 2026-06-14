import { useLocalSearchParams } from "expo-router";

import { ActiveMemberGuard } from "@/provider/active-member-guard";
import { ResponsesRecapScreen } from "@/provider/responses-recap-screen";

/** Customer's response recap (MP-C-041): today's order status + CTA to Today. */
export default function MemberResponsesScreen() {
  const { providerId } = useLocalSearchParams<{ providerId: string }>();
  return (
    <ActiveMemberGuard providerId={providerId}>
      <ResponsesRecapScreen providerId={providerId} />
    </ActiveMemberGuard>
  );
}
