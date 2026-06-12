import { CalendarDays } from "lucide-react";

import { ProviderComingSoon } from "@/components/provider/provider-coming-soon";

import { requireActiveMember } from "../member-access";

export const metadata = { title: "Today's menu" };

/**
 * Customer's Today's Menu landing (spec §12.4 / §14.2). The shell + nav land at
 * CP2 (MP-B-012); the read-only menu itself (default package, alternatives,
 * customizations, cutoff countdown) is MP-B-040 and replaces this placeholder.
 * `requireActiveMember` keeps awaiting customers on the holding screen.
 */
export default async function ProviderTodayPage({
  params,
}: {
  params: Promise<{ providerId: string }>;
}) {
  const { providerId } = await params;
  await requireActiveMember(providerId);

  return (
    <ProviderComingSoon
      icon={CalendarDays}
      title="Today's menu coming soon"
      description="Your provider's menu for today — the default package, alternatives, and the cutoff countdown — will appear here."
    />
  );
}
