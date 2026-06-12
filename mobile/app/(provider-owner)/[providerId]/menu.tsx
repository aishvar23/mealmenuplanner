import { CalendarRange } from "lucide-react-native";

import { ProviderComingSoon } from "@/provider/provider-coming-soon";

/** Owner menu builder — lands with MP-C-030 at CP3 (gated on ADR-7). */
export default function OwnerMenuScreen() {
  return (
    <ProviderComingSoon
      icon={CalendarRange}
      title="Weekly menu coming soon"
      description="Build and publish your weekly menu — components, alternatives, and cutoffs — here."
    />
  );
}
