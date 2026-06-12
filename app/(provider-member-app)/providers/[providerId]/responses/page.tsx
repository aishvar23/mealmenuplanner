import { ClipboardList } from "lucide-react";

import { ProviderComingSoon } from "@/components/provider/provider-coming-soon";

import { requireActiveMember } from "../member-access";

export const metadata = { title: "Your responses" };

/** Customer's response history/management — lands with MP-B-041 at CP4. */
export default async function ProviderMemberResponsesPage({
  params,
}: {
  params: Promise<{ providerId: string }>;
}) {
  const { providerId } = await params;
  await requireActiveMember(providerId);

  return (
    <ProviderComingSoon
      icon={ClipboardList}
      title="Your responses coming soon"
      description="Confirm, update, or cancel your meal choices before the cutoff here."
    />
  );
}
