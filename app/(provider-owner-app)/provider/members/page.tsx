import { Users } from "lucide-react";

import { ProviderComingSoon } from "@/components/provider/provider-coming-soon";

export const metadata = { title: "Members" };

/** Owner member approval — lands with MP-B-022 at CP3. */
export default function ProviderMembersPage() {
  return (
    <ProviderComingSoon
      icon={Users}
      title="Members coming soon"
      description="Invite customers, then approve, reject, or remove them as they join."
    />
  );
}
