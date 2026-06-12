import { LayoutDashboard } from "lucide-react-native";

import { ProviderComingSoon } from "@/provider/provider-coming-soon";

/** Owner landing (MP-C-011); the dashboard cards land with MP-C-060 (CP4/5). */
export default function OwnerDashboardScreen() {
  return (
    <ProviderComingSoon
      icon={LayoutDashboard}
      title="Dashboard coming soon"
      description="Your day at a glance — today's menu, cutoff countdown, and response counts — will appear here."
    />
  );
}
