import { useLocalSearchParams } from "expo-router";
import { CalendarRange } from "lucide-react-native";

import { ActiveMemberGuard } from "@/provider/active-member-guard";
import { ProviderComingSoon } from "@/provider/provider-coming-soon";

/** Customer's weekly menu view — fills in with the menu read work (CP3). */
export default function MemberWeekScreen() {
  const { providerId } = useLocalSearchParams<{ providerId: string }>();
  return (
    <ActiveMemberGuard providerId={providerId}>
      <ProviderComingSoon
        icon={CalendarRange}
        title="This week's menu coming soon"
        description="Your provider's published menu for the week ahead will appear here."
      />
    </ActiveMemberGuard>
  );
}
