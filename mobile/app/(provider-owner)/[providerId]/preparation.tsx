import { Soup } from "lucide-react-native";

import { ProviderComingSoon } from "@/provider/provider-coming-soon";

/** Owner preparation/batch view — lands with MP-C-050 at CP5. */
export default function OwnerPreparationScreen() {
  return (
    <ProviderComingSoon
      icon={Soup}
      title="Preparation coming soon"
      description="Aggregated cooking quantities, per-member breakdowns, and export will appear here after cutoff."
    />
  );
}
