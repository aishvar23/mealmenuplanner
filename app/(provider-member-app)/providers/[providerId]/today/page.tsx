import { CalendarDays } from "lucide-react";

import { ProviderComingSoon } from "@/components/provider/provider-coming-soon";
import { TodayResponseView } from "@/components/provider-member-response/today-response-view";
import { getMyResponse, getTodayMenu } from "@/lib/services/provider";

import { requireActiveMember } from "../member-access";

export const dynamic = "force-dynamic";
export const metadata = { title: "Today's menu" };

/**
 * Customer's Today's Menu + response (MP-B-040 read-only display + MP-B-041
 * interactive response, spec §14.2/§14.3). The server resolves access
 * (`requireActiveMember` keeps awaiting/un-onboarded customers off this page),
 * reads the published menu day (RLS shows only published/locked days to an approved
 * customer) and the caller's own current response, then hands both to the client
 * view. When no menu is published for today, the empty state stands in.
 */
export default async function ProviderTodayPage({
  params,
}: {
  params: Promise<{ providerId: string }>;
}) {
  const { providerId } = await params;
  const membership = await requireActiveMember(providerId);
  const menu = await getTodayMenu(providerId);

  if (!menu) {
    return (
      <ProviderComingSoon
        icon={CalendarDays}
        title="No menu published for today"
        description={`${membership.name} hasn't published today's menu yet. Check back soon.`}
      />
    );
  }

  const response = await getMyResponse(menu.menuDayId);

  return (
    <TodayResponseView
      providerName={membership.name}
      menu={menu}
      initialResponse={response}
    />
  );
}
