import { useLocalSearchParams } from "expo-router";
import { ClipboardList } from "lucide-react-native";

import { ActiveMemberGuard } from "@/provider/active-member-guard";
import { ProviderComingSoon } from "@/provider/provider-coming-soon";

/** Customer's response history/management — lands with MP-C-041 at CP4. */
export default function MemberResponsesScreen() {
  const { providerId } = useLocalSearchParams<{ providerId: string }>();
  return (
    <ActiveMemberGuard providerId={providerId}>
      <ProviderComingSoon
        icon={ClipboardList}
        title="Your responses coming soon"
        description="Confirm, update, or cancel your meal choices before the cutoff here."
      />
    </ActiveMemberGuard>
  );
}
