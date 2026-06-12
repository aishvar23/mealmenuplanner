import { Soup } from "lucide-react";

import { ProviderComingSoon } from "@/components/provider/provider-coming-soon";

export const metadata = { title: "Preparation" };

/** Owner preparation/batch view — lands with MP-B-050 at CP5. */
export default function ProviderPreparationPage() {
  return (
    <ProviderComingSoon
      icon={Soup}
      title="Preparation coming soon"
      description="Aggregated cooking quantities, per-member breakdowns, CSV export, and print will appear here after cutoff."
    />
  );
}
