import { User } from "lucide-react";

import { ProviderComingSoon } from "@/components/provider/provider-coming-soon";

import { requireActiveMember } from "../member-access";

export const metadata = { title: "Your account" };

/** Customer's per-provider account/details — lands with member onboarding (CP3). */
export default async function ProviderAccountPage({
  params,
}: {
  params: Promise<{ providerId: string }>;
}) {
  const { providerId } = await params;
  await requireActiveMember(providerId);

  return (
    <ProviderComingSoon
      icon={User}
      title="Your account coming soon"
      description="Your name, contact details, and default preferences with this provider will be editable here."
    />
  );
}
