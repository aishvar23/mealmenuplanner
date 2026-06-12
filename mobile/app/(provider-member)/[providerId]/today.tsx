import { useLocalSearchParams } from "expo-router";
import { CalendarDays } from "lucide-react-native";

import { ActiveMemberGuard } from "@/provider/active-member-guard";
import { ProviderComingSoon } from "@/provider/provider-coming-soon";

/**
 * Customer's Today's Menu landing (MP-C-012, spec §14.2). The read-only menu
 * itself (default package, alternatives, customizations, cutoff countdown) is
 * MP-C-040 and replaces this placeholder; the guard keeps awaiting customers on
 * the holding screen.
 */
export default function MemberTodayScreen() {
  const { providerId } = useLocalSearchParams<{ providerId: string }>();
  return (
    <ActiveMemberGuard providerId={providerId}>
      <ProviderComingSoon
        icon={CalendarDays}
        title="Today's menu coming soon"
        description="Your provider's menu for today — the default package, alternatives, and the cutoff countdown — will appear here."
      />
    </ActiveMemberGuard>
  );
}
