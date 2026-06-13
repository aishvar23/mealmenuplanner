import { redirect } from "next/navigation";

import { MembersView } from "@/components/provider-members/members-view";
import { listProviderMembers } from "@/lib/services/provider";
import { resolveOwnerProvider } from "@/lib/services/workspace";

export const dynamic = "force-dynamic";
export const metadata = { title: "Members" };

/**
 * Owner Members page (MP-B-022, CP3). Resolves the owner's active provider
 * (id-less `/provider/*` convention), loads the roster server-side under RLS, and
 * hands it to the client view that manages invites + approvals. A user who owns no
 * provider is bounced to the workspace chooser (defense-in-depth on the shell).
 */
export default async function ProviderMembersPage() {
  const provider = await resolveOwnerProvider();
  if (!provider) {
    redirect("/workspace");
  }

  const members = await listProviderMembers(provider.providerId);

  return (
    <MembersView
      providerId={provider.providerId}
      initialMembers={members.data}
    />
  );
}
