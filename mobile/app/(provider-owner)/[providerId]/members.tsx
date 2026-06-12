import { Users } from "lucide-react-native";

import { ProviderComingSoon } from "@/provider/provider-coming-soon";

/** Owner member approval — lands with MP-C-022 at CP3. */
export default function OwnerMembersScreen() {
  return (
    <ProviderComingSoon
      icon={Users}
      title="Members coming soon"
      description="Invite customers, then approve, reject, or remove them as they join."
    />
  );
}
