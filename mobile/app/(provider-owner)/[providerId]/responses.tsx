import { ClipboardList } from "lucide-react-native";

import { ProviderComingSoon } from "@/provider/provider-coming-soon";

/** Owner today's-responses view — fills in with the response/cutoff work (CP4). */
export default function OwnerResponsesScreen() {
  return (
    <ProviderComingSoon
      icon={ClipboardList}
      title="Today's responses coming soon"
      description="Confirmed, cancelled, and auto-accepted member responses for the day will appear here."
    />
  );
}
