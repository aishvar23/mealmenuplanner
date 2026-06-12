import { useLocalSearchParams } from "expo-router";
import { User } from "lucide-react-native";

import { ActiveMemberGuard } from "@/provider/active-member-guard";
import { ProviderComingSoon } from "@/provider/provider-coming-soon";

/** Customer's per-provider account/details — lands with member onboarding (CP3). */
export default function MemberAccountScreen() {
  const { providerId } = useLocalSearchParams<{ providerId: string }>();
  return (
    <ActiveMemberGuard providerId={providerId}>
      <ProviderComingSoon
        icon={User}
        title="Your account coming soon"
        description="Your name, contact details, and default preferences with this provider will be editable here."
      />
    </ActiveMemberGuard>
  );
}
