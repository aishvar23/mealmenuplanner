import { LayoutDashboard } from "lucide-react";

import { ProviderComingSoon } from "@/components/provider/provider-coming-soon";

export const metadata = { title: "Provider dashboard" };

/**
 * Owner landing (spec §12.4 / §13.2). The shell + nav land at CP2 (MP-B-011); the
 * dashboard cards (today's menu state, cutoff, response counts, batch + email
 * status) are MP-B-060 at CP4/5 and replace this placeholder.
 */
export default function ProviderDashboardPage() {
  return (
    <ProviderComingSoon
      icon={LayoutDashboard}
      title="Dashboard coming soon"
      description="Your day at a glance — today's menu, cutoff countdown, and response counts — will appear here."
    />
  );
}
