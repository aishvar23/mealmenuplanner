import { CalendarRange } from "lucide-react";

import { ProviderComingSoon } from "@/components/provider/provider-coming-soon";

import { requireActiveMember } from "../member-access";

export const metadata = { title: "This week" };

/** Customer's weekly menu view — fills in with the menu read work (CP3). */
export default async function ProviderWeekPage({
  params,
}: {
  params: Promise<{ providerId: string }>;
}) {
  const { providerId } = await params;
  await requireActiveMember(providerId);

  return (
    <ProviderComingSoon
      icon={CalendarRange}
      title="This week's menu coming soon"
      description="Your provider's published menu for the week ahead will appear here."
    />
  );
}
