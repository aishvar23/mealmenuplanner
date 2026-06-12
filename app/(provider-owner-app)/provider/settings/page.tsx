import { Settings } from "lucide-react";

import { ProviderComingSoon } from "@/components/provider/provider-coming-soon";

export const metadata = { title: "Provider settings" };

/** Owner settings — edits the org details captured in onboarding (CP3, MP-B-020). */
export default function ProviderSettingsPage() {
  return (
    <ProviderComingSoon
      icon={Settings}
      title="Settings coming soon"
      description="Provider name, contact, timezone, cutoff defaults, and summary-email recipients will be editable here."
    />
  );
}
