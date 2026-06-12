import { ClipboardList } from "lucide-react";

import { ProviderComingSoon } from "@/components/provider/provider-coming-soon";

export const metadata = { title: "Today's responses" };

/** Owner responses view — fills in with the response/cutoff work (CP4). */
export default function ProviderResponsesPage() {
  return (
    <ProviderComingSoon
      icon={ClipboardList}
      title="Today's responses coming soon"
      description="Confirmed, cancelled, and auto-accepted member responses for the day will appear here."
    />
  );
}
