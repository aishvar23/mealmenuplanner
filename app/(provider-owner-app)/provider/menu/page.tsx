import { CalendarRange } from "lucide-react";

import { ProviderComingSoon } from "@/components/provider/provider-coming-soon";

export const metadata = { title: "Weekly menu" };

/** Owner menu builder — lands with MP-B-030 at CP3 (gated on ADR-7). */
export default function ProviderMenuPage() {
  return (
    <ProviderComingSoon
      icon={CalendarRange}
      title="Weekly menu coming soon"
      description="Build and publish your weekly menu — components, alternatives, and cutoffs — here."
    />
  );
}
